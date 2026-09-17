import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { joinCode, newId } from "@/lib/utils";
import type { OpportunityFields, RelationshipType } from "@/lib/domain/types";
import { DEFAULT_GROUP_SIZE, DEFAULT_MAX_PHOTO_BYTES } from "@/lib/domain/config";
import {
  AppError,
  assertGroupMember,
  loadGroupForStudent,
  loadOfferingForStudent,
  loadStudent,
  logEvent,
  refreshGroupStatus,
  requireStudent,
} from "./authz";

function fail(err: unknown): never {
  if (err instanceof AppError) throw err;
  throw err;
}

export const upsertProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    fullName: string;
    indexNumber: string;
    programme: string;
    offeringId: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const fullName = data.fullName.trim();
    const indexNumber = data.indexNumber.trim().toUpperCase();
    const programme = data.programme.trim();
    if (!fullName || !indexNumber || !programme) {
      throw new AppError("INVALID", "Name, index number and programme are required.");
    }
    const sql = await getSql();
    const offering = await sql<{ id: string }>`
      select id from course_offerings where id = ${data.offeringId} limit 1
    `;
    if (!offering[0]) throw new AppError("NOT_FOUND", "That course offering does not exist.");

    const existing = await loadStudent(context.userId);
    const taken = await sql<{ id: string; auth_user_id: string }>`
      select id, auth_user_id from students where index_number = ${indexNumber} limit 1
    `;
    if (taken[0] && taken[0].auth_user_id !== context.userId) {
      throw new AppError("DUPLICATE", "That index number is already registered.");
    }

    const studentId = existing?.id ?? newId();
    if (existing) {
      await sql`
        update students
        set full_name = ${fullName}, index_number = ${indexNumber},
            programme = ${programme}, updated_at = now()
        where id = ${studentId}
      `;
    } else {
      await sql`
        insert into students (id, auth_user_id, full_name, index_number, programme, is_synthetic)
        values (${studentId}, ${context.userId}, ${fullName}, ${indexNumber}, ${programme}, false)
      `;
    }

    const enrolled = await sql<{ id: string }>`
      select id from course_enrolments
      where student_id = ${studentId} and course_offering_id = ${data.offeringId}
      limit 1
    `;
    if (!enrolled[0]) {
      await sql`
        insert into course_enrolments (id, student_id, course_offering_id, status)
        values (${newId()}, ${studentId}, ${data.offeringId}, 'active')
      `;
    }
    await sql`
      insert into user_roles (id, user_id, role_id, course_offering_id)
      values (${newId()}, ${context.userId}, 'role_student', ${data.offeringId})
      on conflict (user_id, role_id, course_offering_id) do nothing
    `;
    await logEvent({
      studentId,
      eventType: existing ? "PROFILE_UPDATED" : "PROFILE_CREATED",
      entityType: "student",
      entityId: studentId,
    });
    return { studentId };
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupName: string }) => input)
  .handler(async ({ context, data }) => {
    try {
      const student = await requireStudent(context.userId);
      const offering = await loadOfferingForStudent(student.id);
      if (!offering) throw new AppError("NO_OFFERING", "Enrol in a course offering first.");
      const existing = await loadGroupForStudent(student.id);
      if (existing) throw new AppError("ALREADY_IN_GROUP", "You already belong to a group in this offering.");

      const sql = await getSql();
      const name = data.groupName.trim();
      if (!name) throw new AppError("INVALID", "Give the group a name.");
      // System reads across groups this student isn't (yet) a member of:
      // the next group number and a join-code collision check. groups_member
      // only grants SELECT to active members, so these need the escape hatch.
      const { groupNumber, code } = await withRlsBypass(async () => {
        const nums = await sql<{ n: number }>`
          select coalesce(max(group_number), 0)::int as n
          from groups where course_offering_id = ${offering.id}
        `;
        const groupNumber = Number(nums[0]?.n ?? 0) + 1;
        let code = joinCode();
        for (let i = 0; i < 5; i++) {
          const clash = await sql<{ id: string }>`select id from groups where join_code = ${code} limit 1`;
          if (!clash[0]) break;
          code = joinCode();
        }
        return { groupNumber, code };
      });
      const groupId = newId();
      const capacity = offering.defaultGroupSize || DEFAULT_GROUP_SIZE;
      await sql`
        insert into groups (
          id, course_offering_id, group_name, group_number, join_code, status,
          created_by_student_id, capacity
        ) values (
          ${groupId}, ${offering.id}, ${name}, ${groupNumber}, ${code}, 'forming',
          ${student.id}, ${capacity}
        )
      `;
      await sql`
        insert into group_members (id, group_id, student_id, membership_status)
        values (${newId()}, ${groupId}, ${student.id}, 'active')
      `;
      await logEvent({
        studentId: student.id,
        groupId,
        eventType: "GROUP_CREATED",
        entityType: "group",
        entityId: groupId,
      });
      return { groupId, joinCode: code, groupNumber };
    } catch (err) {
      fail(err);
    }
  });

export const joinGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { joinCode: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const existing = await loadGroupForStudent(student.id);
    if (existing) throw new AppError("ALREADY_IN_GROUP", "You already belong to a group.");
    const sql = await getSql();
    const code = data.joinCode.trim().toUpperCase();
    // Looking a group up by its join code, and counting its current members,
    // both happen before this student is a member — groups_member and
    // group_members_select only grant that once membership already exists.
    // The join code itself (a unique, unguessable secret) is what actually
    // authorizes this lookup; RLS can't see the literal it's compared against.
    //
    // `for update` locks this one group's row for the rest of the
    // transaction: two students racing to join the same near-full group have
    // their capacity checks properly serialized (the second waits for the
    // first's commit/rollback before its own count query runs), instead of
    // both reading "9 of 10" and both inserting. A load test against this
    // stack's single-connection PGlite fallback didn't reproduce the
    // over-subscription window (it serializes all transactions anyway), but
    // that's an accident of the dev database, not a guarantee — a real
    // connection-pooled Postgres (Neon) is exactly what would expose it.
    const group = await withRlsBypass(async () => {
      const groups = await sql<{
        id: string;
        capacity: number;
        status: string;
      }>`select id, capacity, status from groups where upper(join_code) = ${code} limit 1 for update`;
      const group = groups[0];
      if (!group) return null;
      const count = await sql<{ n: number }>`
        select count(*)::int as n from group_members
        where group_id = ${group.id} and membership_status = 'active'
      `;
      return { ...group, activeCount: Number(count[0]?.n ?? 0) };
    });
    if (!group) throw new AppError("NOT_FOUND", "No group uses that join code.");
    if (group.status === "venture_created") {
      throw new AppError("CLOSED", "This group has already selected a venture.");
    }
    if (group.activeCount >= Number(group.capacity)) {
      throw new AppError("FULL", "This group is full.");
    }
    const dup = await sql<{ id: string }>`
      select id from group_members where group_id = ${group.id} and student_id = ${student.id} limit 1
    `;
    if (dup[0]) throw new AppError("ALREADY_IN_GROUP", "You are already a member of this group.");
    await sql`
      insert into group_members (id, group_id, student_id, membership_status)
      values (${newId()}, ${group.id}, ${student.id}, 'active')
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "GROUP_JOINED",
      entityType: "group",
      entityId: group.id,
    });
    await refreshGroupStatus(group.id);
    return { groupId: group.id };
  });

const emptyFields: OpportunityFields = {
  problem: "",
  affectedPeople: "",
  context: "",
  observedEvidence: "",
  currentAlternatives: "",
  whyItMatters: "",
  possibleSolution: "",
  potentialCustomer: "",
  revenueMechanism: "",
  uncertainties: "",
};

export const upsertOpportunity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { fields: OpportunityFields; submit?: boolean; clientId?: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group before writing an opportunity.");
    if (group.status === "venture_created") {
      throw new AppError("LOCKED", "The group has already selected a venture.");
    }
    const sql = await getSql();
    const existing = await sql<{ id: string; status: string }>`
      select id, status from opportunities
      where student_id = ${student.id} and group_id = ${group.id}
      limit 1
    `;
    const id = data.clientId || existing[0]?.id || newId();
    const fields = { ...emptyFields, ...data.fields };
    const submitting = Boolean(data.submit);
    if (submitting) {
      const required: (keyof OpportunityFields)[] = [
        "problem",
        "affectedPeople",
        "context",
        "observedEvidence",
        "currentAlternatives",
        "whyItMatters",
        "uncertainties",
      ];
      const missing = required.filter((k) => !String(fields[k] ?? "").trim());
      if (missing.length) {
        throw new AppError("INVALID", "Fill every required field before submitting.");
      }
    }
    if (existing[0]) {
      await sql`
        insert into opportunity_revisions (id, opportunity_id, snapshot)
        select ${newId()}, id, row_to_json(opportunities)::text
        from opportunities where id = ${existing[0].id}
      `;
      const nextStatus = submitting ? "submitted" : existing[0].status === "submitted" ? "submitted" : "draft";
      await sql`
        update opportunities set
          problem = ${fields.problem},
          affected_people = ${fields.affectedPeople},
          context = ${fields.context},
          observed_evidence = ${fields.observedEvidence},
          current_alternatives = ${fields.currentAlternatives},
          why_it_matters = ${fields.whyItMatters},
          possible_solution = ${fields.possibleSolution},
          potential_customer = ${fields.potentialCustomer},
          revenue_mechanism = ${fields.revenueMechanism},
          uncertainties = ${fields.uncertainties},
          status = ${nextStatus},
          submitted_at = case when ${submitting} then now() else submitted_at end,
          updated_at = now()
        where id = ${existing[0].id} and student_id = ${student.id}
      `;
    } else {
      await sql`
        insert into opportunities (
          id, student_id, group_id, problem, affected_people, context, observed_evidence,
          current_alternatives, why_it_matters, possible_solution, potential_customer,
          revenue_mechanism, uncertainties, status, submitted_at
        ) values (
          ${id}, ${student.id}, ${group.id},
          ${fields.problem}, ${fields.affectedPeople}, ${fields.context}, ${fields.observedEvidence},
          ${fields.currentAlternatives}, ${fields.whyItMatters}, ${fields.possibleSolution},
          ${fields.potentialCustomer}, ${fields.revenueMechanism}, ${fields.uncertainties},
          ${submitting ? "submitted" : "draft"},
          ${submitting ? new Date().toISOString() : null}
        )
      `;
    }
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: submitting ? "OPPORTUNITY_SUBMITTED" : "OPPORTUNITY_CREATED",
      entityType: "opportunity",
      entityId: id,
    });
    if (submitting) await refreshGroupStatus(group.id);
    return { id, submitted: submitting };
  });

export const recordPreference = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { opportunityId: string; rationale: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    if (!["selection_ready", "selection", "venture_created"].includes(group.status)) {
      throw new AppError("CLOSED", "Selection has not opened yet.");
    }
    const rationale = data.rationale.trim();
    if (!rationale) throw new AppError("INVALID", "Explain why you prefer this opportunity.");
    const sql = await getSql();
    const opp = await sql<{ id: string; group_id: string; status: string }>`
      select id, group_id, status from opportunities where id = ${data.opportunityId} limit 1
    `;
    if (!opp[0] || opp[0].group_id !== group.id || opp[0].status === "draft") {
      throw new AppError("NOT_FOUND", "That opportunity is not available for selection.");
    }
    await sql`delete from opportunity_preferences where student_id = ${student.id}
      and opportunity_id in (select id from opportunities where group_id = ${group.id})`;
    const id = newId();
    await sql`
      insert into opportunity_preferences (id, opportunity_id, student_id, preference_rank, rationale)
      values (${id}, ${data.opportunityId}, ${student.id}, 1, ${rationale})
    `;
    if (group.status === "selection_ready") {
      await sql`update groups set status = 'selection', updated_at = now() where id = ${group.id}`;
    }
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "PREFERENCE_RECORDED",
      entityType: "opportunity_preference",
      entityId: id,
    });
    return { id };
  });

export const createVenture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { opportunityId: string; name: string; selectionRationale: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    await assertGroupMember(student.id, group.id);
    if (!["selection_ready", "selection"].includes(group.status)) {
      throw new AppError("CLOSED", "The group is not in selection.");
    }
    const rationale = data.selectionRationale.trim();
    if (rationale.length < 40) {
      throw new AppError(
        "INVALID",
        "The selection rationale must explain why this opportunity rather than the alternatives.",
      );
    }
    const sql = await getSql();
    const already = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
    if (already[0]) throw new AppError("EXISTS", "This group already has a venture.");

    const memberCount = await sql<{ n: number }>`
      select count(*)::int as n from group_members
      where group_id = ${group.id} and membership_status = 'active'
    `;
    const prefCount = await sql<{ n: number }>`
      select count(distinct p.student_id)::int as n
      from opportunity_preferences p
      where exists (
        select 1 from opportunities o
        where o.id = p.opportunity_id and o.group_id = ${group.id}
      )
    `;
    if (Number(prefCount[0]?.n ?? 0) < Number(memberCount[0]?.n ?? 0)) {
      throw new AppError("PREFERENCES", "Every active member must record a preference first.");
    }
    const opp = await sql<{ id: string; problem: string }>`
      select id, problem from opportunities
      where id = ${data.opportunityId} and group_id = ${group.id} and status <> 'draft'
      limit 1
    `;
    if (!opp[0]) throw new AppError("NOT_FOUND", "That opportunity cannot be selected.");

    const ventureId = newId();
    const name = data.name.trim() || opp[0].problem.slice(0, 80);
    await sql`
      insert into ventures (id, group_id, opportunity_id, name, status, selection_rationale)
      values (${ventureId}, ${group.id}, ${opp[0].id}, ${name}, 'active', ${rationale})
    `;
    // The group's decision, already fully validated above (preferences
    // complete, rationale given, group in selection), transitions every
    // member's opportunity — opportunities_write only allows writing your own
    // row, so recording rejection of the alternatives needs the escape hatch.
    await withRlsBypass(async () => {
      await sql`
        update opportunities set status = 'selected', updated_at = now()
        where id = ${opp[0].id}
      `;
      await sql`
        update opportunities set status = 'rejected', updated_at = now()
        where group_id = ${group.id} and id <> ${opp[0].id} and status = 'submitted'
      `;
    });
    await sql`update groups set status = 'venture_created', updated_at = now() where id = ${group.id}`;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "VENTURE_CREATED",
      entityType: "venture",
      entityId: ventureId,
    });
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "OPPORTUNITY_SELECTED",
      entityType: "opportunity",
      entityId: opp[0].id,
    });
    return { ventureId };
  });

export const createEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientId?: string;
    title: string;
    content: string;
    sourceType: string;
    classification: string;
    photoData?: string | null;
    photoMime?: string | null;
    observedAt?: string | null;
    locationContext?: string | null;
  }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const v = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
    if (!v[0]) throw new AppError("NO_VENTURE", "Select a venture before logging evidence.");
    const title = data.title.trim();
    if (!title) throw new AppError("INVALID", "Give this evidence a short title.");
    const offering = await loadOfferingForStudent(student.id);
    const maxBytes = offering?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES;
    if (data.photoData && data.photoData.length > maxBytes * 1.4) {
      throw new AppError("PHOTO", "The photo is too large. Compress it and try again.");
    }
    const id = data.clientId || newId();
    const existing = await sql<{ id: string }>`select id from evidence_items where id = ${id} limit 1`;
    if (existing[0]) return { id };
    await sql`
      insert into evidence_items (
        id, venture_id, student_id, title, content, source_type, classification,
        photo_data, photo_mime, observed_at, location_context
      ) values (
        ${id}, ${v[0].id}, ${student.id}, ${title}, ${data.content.trim()},
        ${data.sourceType}, ${data.classification},
        ${data.photoData ?? null}, ${data.photoMime ?? null},
        ${data.observedAt ?? null}, ${data.locationContext ?? null}
      )
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId: v[0].id,
      eventType: "EVIDENCE_CREATED",
      entityType: "evidence",
      entityId: id,
    });
    return { id };
  });

export const createAssumption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientId?: string;
    statement: string;
    importance: string;
    confidence: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const v = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
    if (!v[0]) throw new AppError("NO_VENTURE", "Select a venture before logging assumptions.");
    const statement = data.statement.trim();
    if (!statement) throw new AppError("INVALID", "Write the assumption as a testable statement.");
    const id = data.clientId || newId();
    const existing = await sql<{ id: string }>`select id from assumptions where id = ${id} limit 1`;
    if (existing[0]) return { id };
    await sql`
      insert into assumptions (id, venture_id, student_id, statement, importance, confidence, status)
      values (${id}, ${v[0].id}, ${student.id}, ${statement}, ${data.importance}, ${data.confidence}, 'open')
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId: v[0].id,
      eventType: "ASSUMPTION_CREATED",
      entityType: "assumption",
      entityId: id,
    });
    return { id };
  });

export const linkEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientId?: string;
    assumptionId: string;
    evidenceItemId: string;
    relationshipType: RelationshipType;
  }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const a = await sql<{ id: string; venture_id: string }>`
      select a.id, a.venture_id from assumptions a
      join ventures v on v.id = a.venture_id
      where a.id = ${data.assumptionId} and v.group_id = ${group.id}
      limit 1
    `;
    const e = await sql<{ id: string; venture_id: string }>`
      select e.id, e.venture_id from evidence_items e
      join ventures v on v.id = e.venture_id
      where e.id = ${data.evidenceItemId} and v.group_id = ${group.id}
      limit 1
    `;
    if (!a[0] || !e[0] || a[0].venture_id !== e[0].venture_id) {
      throw new AppError("NOT_FOUND", "Both records must belong to your group's venture.");
    }
    const id = data.clientId || newId();
    await sql`
      insert into assumption_evidence (
        id, assumption_id, evidence_item_id, relationship_type, created_by_student_id
      ) values (
        ${id}, ${data.assumptionId}, ${data.evidenceItemId}, ${data.relationshipType}, ${student.id}
      )
      on conflict (assumption_id, evidence_item_id, relationship_type) do nothing
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId: a[0].venture_id,
      eventType: "EVIDENCE_LINKED",
      entityType: "assumption_evidence",
      entityId: id,
      metadata: { relationshipType: data.relationshipType },
    });
    return { id };
  });
