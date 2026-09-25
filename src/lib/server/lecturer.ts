import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { dbSource, getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { MARKET_EVENT_BY_KEY } from "@/lib/domain/market-events";
import { STAGES } from "@/lib/domain/stages";
import { AppError, logEvent, mapOffering, OFFERING_COLUMNS, refreshGroupStatus, type OfferingRow } from "./authz";
import { loadCohort, loadStaff, requireStaff, requireStaffForGroup } from "./lecturer-core";
import { loadVentureWork } from "./workspace-venture";
import { resettleOpenProposal } from "./governance-core";

// Server functions for the lecturer console. Exports server functions only.

const FEED_EVENTS = [
  "OPPORTUNITY_SUBMITTED",
  "PROPOSAL_CREATED",
  "VENTURE_CREATED",
  "INTERVIEW_LOGGED",
  "EVIDENCE_CREATED",
  "CANVAS_ENTRY_ADDED",
  "FEASIBILITY_ASSESSED",
  "FINANCE_SAVED",
  "PROTOTYPE_CREATED",
  "PROTOTYPE_TESTED",
  "DECISION_PROPOSED",
  "DECISION_RATIFIED",
  "PLAN_SECTION_SAVED",
  "MARKET_EVENT_RESPONDED",
  "MESSAGE_SENT",
  "GROUP_LEFT",
];

/** Demo code, accepted only on the embedded preview database. */
const PREVIEW_STAFF_CODE = "DEMO-STAFF";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : "");

export const getStaffStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await loadStaff(context.userId);
    const sql = await getSql();
    const offerings = await sql.query<OfferingRow>(
      `select ${OFFERING_COLUMNS} from course_offerings o join courses c on c.id = o.course_id order by o.academic_year desc`,
    );
    return {
      staff: staff ? { id: staff.staffId, fullName: staff.fullName, offeringIds: staff.offeringIds } : null,
      offerings: offerings.map(mapOffering).filter((o) => !staff || staff.offeringIds.includes(o.id)),
      allOfferings: offerings.map(mapOffering),
      previewCodeHint: dbSource === "pglite" && !process.env.STAFF_ACCESS_CODE ? PREVIEW_STAFF_CODE : null,
    };
  });

/**
 * Register the signed-in account as teaching staff for an offering. The
 * access code is issued by the course administrator (STAFF_ACCESS_CODE on the
 * server). With no code configured, staff registration is closed — except on
 * the embedded preview database, where a demo code lets people try it.
 */
export const registerStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { fullName: string; title?: string; accessCode: string; offeringId: string }) => input)
  .handler(async ({ context, data }) => {
    const configured = process.env.STAFF_ACCESS_CODE?.trim();
    const expected = configured || (dbSource === "pglite" ? PREVIEW_STAFF_CODE : null);
    if (!expected) {
      throw new AppError("CLOSED", "Staff registration is not open. Ask the course administrator.");
    }
    if (data.accessCode.trim() !== expected) {
      throw new AppError("FORBIDDEN", "That staff access code is not right.");
    }
    const fullName = data.fullName.trim();
    if (fullName.length < 3) throw new AppError("INVALID", "Enter your full name.");
    const sql = await getSql();
    const offering = await sql<{ id: string }>`select id from course_offerings where id = ${data.offeringId} limit 1`;
    if (!offering[0]) throw new AppError("NOT_FOUND", "That course offering does not exist.");
    // Staff identity and role are written before the caller holds any role,
    // so no policy can grant them yet — the access code is the authority.
    await withRlsBypass(async () => {
      const existing = await sql<{ id: string }>`select id from staff where auth_user_id = ${context.userId} limit 1`;
      if (!existing[0]) {
        await sql`
          insert into staff (id, auth_user_id, full_name, title)
          values (${newId()}, ${context.userId}, ${fullName}, ${String(data.title ?? "").trim()})
        `;
      }
      await sql`
        insert into user_roles (id, user_id, role_id, course_offering_id)
        values (${newId()}, ${context.userId}, 'role_lecturer', ${data.offeringId})
        on conflict (user_id, role_id, course_offering_id) do nothing
      `;
      await logEvent({ eventType: "STAFF_REGISTERED", entityType: "course_offering", entityId: data.offeringId });
    });
    return { ok: true };
  });

export const getCohort = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaff(context.userId, data.offeringId);
    const sql = await getSql();
    const [groups, enrolled, milestones, announcements, events, staffList] = await Promise.all([
      loadCohort(data.offeringId, undefined, context.userId),
      sql<{ n: number; ungrouped: number }>`
        select count(*)::int as n,
          count(*) filter (where not exists (
            select 1 from group_members gm join groups g on g.id = gm.group_id
            where gm.student_id = e.student_id and gm.membership_status = 'active' and g.course_offering_id = e.course_offering_id
          ))::int as ungrouped
        from course_enrolments e join students s on s.id = e.student_id
        where e.course_offering_id = ${data.offeringId} and e.status = 'active' and s.is_synthetic = false
      `,
      sql<{ stage: string; due_at: unknown; note: string }>`
        select stage, due_at, note from milestones where course_offering_id = ${data.offeringId} order by due_at
      `,
      sql<{ id: string; title: string; body: string; created_at: unknown; staff_name: string }>`
        select a.id, a.title, a.body, a.created_at, s.full_name as staff_name
        from announcements a join staff s on s.id = a.staff_id
        where a.course_offering_id = ${data.offeringId} order by a.created_at desc limit 20
      `,
      sql<Record<string, unknown>>`
        select e.id, e.title, e.event_key, e.respond_by, e.created_at, e.group_id,
          (select count(*)::int from event_responses r where r.event_id = e.id) as responses
        from market_events e where e.course_offering_id = ${data.offeringId}
        order by e.created_at desc limit 30
      `,
      sql<{ id: string; full_name: string }>`
        select distinct s.id, s.full_name from staff s
        join user_roles ur on ur.user_id = s.auth_user_id
        where ur.course_offering_id = ${data.offeringId}
      `,
    ]);
    return {
      me: { id: staff.staffId, fullName: staff.fullName },
      groups,
      enrolled: Number(enrolled[0]?.n ?? 0),
      ungrouped: Number(enrolled[0]?.ungrouped ?? 0),
      milestones: milestones.map((m) => ({ stage: m.stage, dueAt: iso(m.due_at), note: m.note })),
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        createdAt: iso(a.created_at),
        staffName: a.staff_name,
      })),
      events: events.map((e) => ({
        id: String(e.id),
        title: String(e.title),
        eventKey: String(e.event_key),
        respondBy: e.respond_by ? iso(e.respond_by) : null,
        createdAt: iso(e.created_at),
        groupId: e.group_id ? String(e.group_id) : null,
        responses: Number(e.responses ?? 0),
      })),
      staff: staffList.map((s) => ({ id: s.id, fullName: s.full_name })),
    };
  });

export const getGroupDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaffForGroup(context.userId, data.groupId);
    const sql = await getSql();
    const group = await sql<Record<string, unknown>>`
      select g.*, v.id as venture_id, v.name as venture_name, v.status as venture_status,
             v.selection_rationale, v.opportunity_id
      from groups g left join ventures v on v.group_id = g.id
      where g.id = ${data.groupId} limit 1
    `;
    const g = group[0];
    const members = await sql<Record<string, unknown>>`
      select gm.id, gm.student_id, gm.membership_status, gm.status_reason, s.full_name, s.index_number,
             s.programme, s.is_synthetic,
             (select max(a.created_at) from activity_events a where a.student_id = gm.student_id and a.group_id = gm.group_id) as last_at
      from group_members gm join students s on s.id = gm.student_id
      where gm.group_id = ${data.groupId}
      order by gm.joined_at
    `;
    const contributions = await sql<{ student_id: string; event_type: string; n: number }>`
      select student_id, event_type, count(*)::int as n
      from activity_events where group_id = ${data.groupId} and student_id is not null
      group by student_id, event_type
    `;
    const ratings = await sql<{ ratee_student_id: string; avg: string; n: number; comments: string | null }>`
      select ratee_student_id, avg(score)::numeric(3,1)::text as avg, count(*)::int as n,
             string_agg(nullif(comment, ''), ' · ') as comments
      from peer_ratings where group_id = ${data.groupId}
      group by ratee_student_id
    `;
    const reflections = await sql<Record<string, unknown>>`
      select r.id, r.stage, r.body, r.created_at, s.full_name
      from reflections r join students s on s.id = r.student_id
      where r.group_id = ${data.groupId} order by r.created_at desc
    `;
    const opportunities = await sql<Record<string, unknown>>`
      select o.id, o.problem, o.observed_evidence, o.status, s.full_name
      from opportunities o join students s on s.id = o.student_id
      where o.group_id = ${data.groupId} and o.status <> 'draft'
    `;
    const feedback = await sql<Record<string, unknown>>`
      select f.id, f.stage, f.body, f.level, f.created_at, s.full_name as staff_name
      from feedback f join staff s on s.id = f.staff_id
      where f.group_id = ${data.groupId} order by f.created_at desc
    `;
    const timeline = await sql<Record<string, unknown>>`
      select a.event_type, a.created_at, s.full_name
      from activity_events a left join students s on s.id = a.student_id
      where a.group_id = ${data.groupId} order by a.created_at desc limit 60
    `;
    const advisor = await sql<Record<string, unknown>>`
      select m.role, m.content, m.created_at, s.full_name
      from ai_advisor_messages m left join students s on s.id = m.student_id
      where m.group_id = ${data.groupId} order by m.created_at desc limit 30
    `;
    const [summary] = await loadCohort(staff.offeringId, data.groupId, context.userId);
    const thread = await sql<Record<string, unknown>>`
      select m.id, m.body, m.created_at, m.author_staff_id, m.author_student_id, m.recipient_student_id,
             coalesce(st.full_name, s.full_name) as author_name, r.full_name as recipient_name
      from messages m
      left join staff st on st.id = m.author_staff_id
      left join students s on s.id = m.author_student_id
      left join students r on r.id = m.recipient_student_id
      where m.group_id = ${data.groupId}
      order by m.created_at asc
    `;
    const ventureId = g?.venture_id ? String(g.venture_id) : null;
    const activeCount = members.filter((m) => m.membership_status === "active").length;
    const work = ventureId ? await loadVentureWork(ventureId, activeCount, 51) : null;
    const evidence = ventureId
      ? await sql<Record<string, unknown>>`
          select e.id, e.title, e.content, e.classification, e.source_type, e.created_at, s.full_name
          from evidence_items e join students s on s.id = e.student_id
          where e.venture_id = ${ventureId} order by e.created_at desc
        `
      : [];
    const assumptions = ventureId
      ? await sql<Record<string, unknown>>`
          select a.id, a.statement, a.importance, a.confidence, a.status,
            (select count(*)::int from assumption_evidence ae where ae.assumption_id = a.id and ae.relationship_type = 'supports') as supports,
            (select count(*)::int from assumption_evidence ae where ae.assumption_id = a.id and ae.relationship_type = 'challenges') as challenges
          from assumptions a where a.venture_id = ${ventureId} order by a.created_at
        `
      : [];

    const contrib = (sid: string) => contributions.filter((c) => c.student_id === sid);
    return {
      offeringId: staff.offeringId,
      flags: summary?.flags ?? [],
      pulse: summary?.pulse ?? "",
      thread: thread.map((m) => ({
        id: String(m.id),
        body: String(m.body),
        createdAt: iso(m.created_at),
        authorKind: (m.author_staff_id ? "staff" : "student") as "staff" | "student",
        authorName: String(m.author_name ?? ""),
        recipientName: m.recipient_name ? String(m.recipient_name) : null,
        recipientStudentId: m.recipient_student_id ? String(m.recipient_student_id) : null,
      })),
      currentStage: summary?.currentStage ?? null,
      stagesDone: summary?.stagesDone ?? 0,
      group: {
        id: String(g.id),
        groupNumber: Number(g.group_number),
        groupName: String(g.group_name),
        status: String(g.status),
        joinCode: String(g.join_code),
        assignedStaffId: g.assigned_staff_id ? String(g.assigned_staff_id) : null,
        ventureName: g.venture_name ? String(g.venture_name) : null,
        ventureStatus: g.venture_status ? String(g.venture_status) : null,
        selectionRationale: g.selection_rationale ? String(g.selection_rationale) : null,
        selectedOpportunityId: g.opportunity_id ? String(g.opportunity_id) : null,
      },
      members: members.map((m) => {
        const c = contrib(String(m.student_id));
        const rating = ratings.find((r) => r.ratee_student_id === m.student_id);
        return {
          memberId: String(m.id),
          studentId: String(m.student_id),
          fullName: String(m.full_name),
          indexNumber: String(m.index_number),
          programme: String(m.programme),
          isSynthetic: m.is_synthetic === true || m.is_synthetic === "t",
          status: String(m.membership_status),
          statusReason: m.status_reason ? String(m.status_reason) : null,
          lastActivityAt: m.last_at ? iso(m.last_at) : null,
          total: c.reduce((n, x) => n + x.n, 0),
          byType: Object.fromEntries(c.map((x) => [x.event_type, x.n])),
          peerAvg: rating ? Number(rating.avg) : null,
          peerCount: rating?.n ?? 0,
          peerComments: rating?.comments ?? null,
        };
      }),
      reflections: reflections.map((r) => ({
        id: String(r.id),
        stage: String(r.stage),
        body: String(r.body),
        createdAt: iso(r.created_at),
        fullName: String(r.full_name),
      })),
      opportunities: opportunities.map((o) => ({
        id: String(o.id),
        problem: String(o.problem),
        observedEvidence: String(o.observed_evidence),
        status: String(o.status),
        fullName: String(o.full_name),
      })),
      feedback: feedback.map((f) => ({
        id: String(f.id),
        stage: String(f.stage),
        body: String(f.body),
        level: f.level === null || f.level === undefined ? null : Number(f.level),
        createdAt: iso(f.created_at),
        staffName: String(f.staff_name),
      })),
      timeline: timeline.map((t) => ({
        eventType: String(t.event_type),
        createdAt: iso(t.created_at),
        fullName: t.full_name ? String(t.full_name) : null,
      })),
      advisor: advisor.map((a) => ({
        role: String(a.role),
        content: String(a.content),
        createdAt: iso(a.created_at),
        fullName: a.full_name ? String(a.full_name) : null,
      })),
      evidence: evidence.map((e) => ({
        id: String(e.id),
        title: String(e.title),
        content: String(e.content),
        classification: String(e.classification),
        sourceType: String(e.source_type),
        createdAt: iso(e.created_at),
        fullName: String(e.full_name),
      })),
      assumptions: assumptions.map((a) => ({
        id: String(a.id),
        statement: String(a.statement),
        importance: String(a.importance),
        confidence: String(a.confidence),
        status: String(a.status),
        supports: Number(a.supports),
        challenges: Number(a.challenges),
      })),
      work,
    };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string; memberId: string; status: "active" | "inactive"; reason: string }) => input)
  .handler(async ({ context, data }) => {
    await requireStaffForGroup(context.userId, data.groupId);
    if (data.status !== "active" && data.status !== "inactive") throw new AppError("INVALID", "Choose a status.");
    const reason = data.reason.trim();
    if (reason.length < 5) throw new AppError("INVALID", "Give a reason — the group will see it.");
    const sql = await getSql();
    const rows = await sql<{ id: string; student_id: string }>`
      update group_members
      set membership_status = ${data.status}, status_reason = ${reason},
          status_changed_at = now(), status_changed_by = ${context.userId}
      where id = ${data.memberId} and group_id = ${data.groupId} and membership_status <> 'left'
      returning id, student_id
    `;
    if (!rows[0]) throw new AppError("NOT_FOUND", "That member is not in this group.");
    await withRlsBypass(() =>
      logEvent({
        groupId: data.groupId,
        eventType: data.status === "inactive" ? "MEMBER_MARKED_INACTIVE" : "MEMBER_REACTIVATED",
        entityType: "group_member",
        entityId: data.memberId,
        metadata: { reason, studentId: rows[0].student_id },
      }),
    );
    // One fewer (or more) active member changes what "everyone has submitted"
    // and what a majority is — re-evaluate both now, not at the next click.
    await withRlsBypass(() => refreshGroupStatus(data.groupId));
    await resettleOpenProposal(data.groupId, null);
    return { ok: true };
  });

export const giveFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string; stage: string; body: string; level?: number | null }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaffForGroup(context.userId, data.groupId);
    if (!STAGES.some((s) => s.id === data.stage)) throw new AppError("INVALID", "Choose a stage.");
    const body = data.body.trim();
    if (body.length < 10) throw new AppError("INVALID", "Write a little more feedback.");
    const level = data.level ? Math.min(4, Math.max(1, Math.round(data.level))) : null;
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into feedback (id, group_id, staff_id, stage, body, level)
      values (${id}, ${data.groupId}, ${staff.staffId}, ${data.stage}, ${body}, ${level})
    `;
    await withRlsBypass(() =>
      logEvent({ groupId: data.groupId, eventType: "FEEDBACK_GIVEN", entityType: "feedback", entityId: id, metadata: { stage: data.stage } }),
    );
    return { id };
  });

export const assignGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string; assign: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaffForGroup(context.userId, data.groupId);
    const sql = await getSql();
    await sql`
      update groups set assigned_staff_id = ${data.assign ? staff.staffId : null}, updated_at = updated_at
      where id = ${data.groupId}
    `;
    return { ok: true };
  });

export const postAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string; title: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaff(context.userId, data.offeringId);
    const title = data.title.trim();
    const body = data.body.trim();
    if (!title || body.length < 10) throw new AppError("INVALID", "Give it a title and a message.");
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into announcements (id, course_offering_id, staff_id, title, body)
      values (${id}, ${data.offeringId}, ${staff.staffId}, ${title}, ${body})
    `;
    return { id };
  });

export const releaseMarketEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string; eventKey: string; groupId?: string | null; respondInDays: number }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaff(context.userId, data.offeringId);
    const template = MARKET_EVENT_BY_KEY[data.eventKey];
    if (!template) throw new AppError("INVALID", "Unknown market event.");
    const sql = await getSql();
    if (data.groupId) {
      const g = await sql<{ id: string }>`
        select id from groups where id = ${data.groupId} and course_offering_id = ${data.offeringId} limit 1
      `;
      if (!g[0]) throw new AppError("NOT_FOUND", "That group is not in this course.");
    }
    const days = Math.min(30, Math.max(1, Math.round(Number(data.respondInDays) || 3)));
    const respondBy = new Date(Date.now() + days * 86_400_000).toISOString();
    const id = newId();
    await sql`
      insert into market_events (id, course_offering_id, group_id, staff_id, event_key, title, body, prompt, respond_by)
      values (${id}, ${data.offeringId}, ${data.groupId ?? null}, ${staff.staffId}, ${template.key},
              ${template.title}, ${template.body}, ${template.prompt}, ${respondBy})
    `;
    return { id };
  });

export const setMilestone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string; stage: string; dueAt: string | null; note?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId, data.offeringId);
    if (!STAGES.some((s) => s.id === data.stage)) throw new AppError("INVALID", "Choose a stage.");
    const sql = await getSql();
    if (!data.dueAt) {
      await sql`delete from milestones where course_offering_id = ${data.offeringId} and stage = ${data.stage}`;
      return { ok: true };
    }
    const due = new Date(data.dueAt);
    if (Number.isNaN(due.getTime())) throw new AppError("INVALID", "That date is not valid.");
    await sql`
      insert into milestones (id, course_offering_id, stage, due_at, note)
      values (${newId()}, ${data.offeringId}, ${data.stage}, ${due.toISOString()}, ${String(data.note ?? "").trim()})
      on conflict (course_offering_id, stage)
      do update set due_at = excluded.due_at, note = excluded.note, updated_at = now()
    `;
    return { ok: true };
  });

/**
 * One row per enrolled student, for the course's own marking spreadsheet.
 * The platform does not award grades; it gives the lecturer the evidence.
 */
export const getGradebook = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string }) => input)
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId, data.offeringId);
    const sql = await getSql();
    const cohort = await loadCohort(data.offeringId);
    const rows = await sql<Record<string, unknown>>`
      select s.id, s.full_name, s.index_number, s.programme, g.id as group_id, g.group_number, g.group_name,
        gm.membership_status,
        (select count(*)::int from activity_events a where a.student_id = s.id) as actions,
        (select count(*)::int from evidence_items e where e.student_id = s.id) as evidence,
        (select count(*)::int from interviews i where i.student_id = s.id) as interviews,
        (select count(*)::int from prototype_tests t where t.student_id = s.id) as tests,
        (select count(*)::int from reflections r where r.student_id = s.id) as reflections,
        (select count(*)::int from event_responses r where r.student_id = s.id) as shock_responses,
        (select avg(p.score)::numeric(3,1)::text from peer_ratings p where p.ratee_student_id = s.id) as peer_avg,
        (select count(*)::int from ai_advisor_messages m where m.student_id = s.id and m.role = 'student') as advisor_questions
      from course_enrolments e
      join students s on s.id = e.student_id
      left join group_members gm on gm.student_id = s.id
      left join groups g on g.id = gm.group_id and g.course_offering_id = e.course_offering_id
      where e.course_offering_id = ${data.offeringId} and s.is_synthetic = false
      order by g.group_number nulls last, s.full_name
    `;
    return rows.map((r) => {
      const c = cohort.find((x) => x.id === r.group_id);
      return {
        fullName: String(r.full_name),
        indexNumber: String(r.index_number),
        programme: String(r.programme),
        group: r.group_number ? `${r.group_number} · ${r.group_name}` : "",
        membership: r.membership_status ? String(r.membership_status) : "no group",
        stopsDone: c?.stagesDone ?? 0,
        actions: Number(r.actions),
        evidence: Number(r.evidence),
        interviews: Number(r.interviews),
        tests: Number(r.tests),
        reflections: Number(r.reflections),
        shockResponses: Number(r.shock_responses),
        peerAvg: r.peer_avg ? Number(r.peer_avg) : null,
        advisorQuestions: Number(r.advisor_questions),
      };
    });
  });

/** The cohort's notable moments as sentences — what groups are actually doing. */
export const getCohortFeed = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string; mineOnly?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaff(context.userId, data.offeringId);
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select a.event_type, a.created_at, a.metadata, g.id as group_id, g.group_number, g.group_name,
             v.name as venture_name, s.full_name
      from activity_events a
      join groups g on g.id = a.group_id
      left join ventures v on v.group_id = g.id
      left join students s on s.id = a.student_id
      where g.course_offering_id = ${data.offeringId}
        and a.event_type = any(${FEED_EVENTS}::text[])
        and (${Boolean(data.mineOnly)} = false or g.assigned_staff_id = ${staff.staffId})
        and coalesce(s.is_synthetic, false) = false
      order by a.created_at desc
      limit 80
    `;
    return rows.map((r) => ({
      eventType: String(r.event_type),
      createdAt: iso(r.created_at),
      groupId: String(r.group_id),
      groupLabel: `Group ${r.group_number} · ${r.venture_name ?? r.group_name}`,
      who: r.full_name ? String(r.full_name) : null,
    }));
  });

