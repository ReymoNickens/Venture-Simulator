import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { joinCode, newId } from "@/lib/utils";
import { PEERS } from "@/lib/demo/peers";
import { AppError, loadGroupForStudent, loadOfferingForStudent, logEvent, requireStudent } from "./authz";

export const bootstrapDemoCohort = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const student = await requireStudent(context.userId);
    const offering = await loadOfferingForStudent(student.id);
    if (!offering) throw new AppError("NO_OFFERING", "Enrol in a course offering first.");
    const existing = await loadGroupForStudent(student.id);
    if (existing) {
      throw new AppError(
        "ALREADY_IN_GROUP",
        "You already have a group. Leave it before entering the demonstration cohort — or continue with that group.",
      );
    }
    const sql = await getSql();
    // Cross-group read (groups_member only grants SELECT to active members),
    // same as createGroup's group-number lookup.
    const groupNumber = await withRlsBypass(async () => {
      const nums = await sql<{ n: number }>`
        select coalesce(max(group_number), 0)::int as n
        from groups where course_offering_id = ${offering.id}
      `;
      return Number(nums[0]?.n ?? 0) + 1;
    });
    const groupId = newId();
    const code = `D${joinCode(5)}`;
    const first = student.fullName.split(" ")[0] || "Studio";
    await sql`
      insert into groups (
        id, course_offering_id, group_name, group_number, join_code, status,
        created_by_student_id, capacity
      ) values (
        ${groupId}, ${offering.id}, ${`Demo · ${first}`}, ${groupNumber}, ${code},
        'opportunity_collection', ${student.id}, ${offering.defaultGroupSize}
      )
    `;
    await sql`
      insert into group_members (id, group_id, student_id, membership_status)
      values (${newId()}, ${groupId}, ${student.id}, 'active')
    `;

    // Seeding synthetic peers writes rows owned by students other than the
    // caller (students_write, opportunities_write, etc. all check "your own
    // row") — this is the one place the app deliberately creates data on
    // another identity's behalf, so it runs under the escape hatch.
    const peerIds: string[] = await withRlsBypass(async () => {
      const ids: string[] = [];
      for (let i = 0; i < PEERS.length; i++) {
        const peer = PEERS[i];
        const sid = newId();
        ids.push(sid);
        const indexNumber = `${peer.index}-${groupId.slice(0, 6).toUpperCase()}`;
        await sql`
          insert into students (id, auth_user_id, full_name, index_number, programme, is_synthetic)
          values (${sid}, ${`seed:${groupId}:${i}`}, ${peer.name}, ${indexNumber}, ${peer.programme}, true)
        `;
        await sql`
          insert into course_enrolments (id, student_id, course_offering_id, status)
          values (${newId()}, ${sid}, ${offering.id}, 'active')
        `;
        await sql`
          insert into group_members (id, group_id, student_id, membership_status)
          values (${newId()}, ${groupId}, ${sid}, 'active')
        `;
        const o = peer.opportunity;
        const oid = newId();
        await sql`
          insert into opportunities (
            id, student_id, group_id, problem, affected_people, context, observed_evidence,
            current_alternatives, why_it_matters, possible_solution, potential_customer,
            revenue_mechanism, uncertainties, status, submitted_at
          ) values (
            ${oid}, ${sid}, ${groupId},
            ${o.problem}, ${o.affectedPeople}, ${o.context}, ${o.observedEvidence},
            ${o.currentAlternatives}, ${o.whyItMatters}, ${o.possibleSolution},
            ${o.potentialCustomer}, ${o.revenueMechanism}, ${o.uncertainties},
            'submitted', now()
          )
        `;
        await sql`
          insert into opportunity_preferences (id, opportunity_id, student_id, preference_rank, rationale)
          values (${newId()}, ${oid}, ${sid}, 1, ${peer.preferenceNote})
        `;
      }
      return ids;
    });

    await logEvent({
      studentId: student.id,
      groupId,
      eventType: "GROUP_CREATED",
      entityType: "group",
      entityId: groupId,
      metadata: { demo: true, peers: peerIds.length },
    });
    return { groupId, joinCode: code, peers: PEERS.length };
  });
