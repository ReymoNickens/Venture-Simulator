import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import {
  AppError,
  assertGroupMember,
  loadGroupForStudent,
  logEvent,
  refreshGroupStatus,
  requireStudent,
} from "./authz";
import { groupCounts, resettleOpenProposal, settleProposal } from "./governance-core";

const MIN_RATIONALE = 40;
const MIN_OBJECTION = 15;

export const proposeVenture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { opportunityId: string; name: string; rationale: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    await assertGroupMember(student.id, group.id);
    if (!["selection_ready", "selection"].includes(group.status)) {
      throw new AppError("CLOSED", "The group is not in selection.");
    }
    const rationale = data.rationale.trim();
    if (rationale.length < MIN_RATIONALE) {
      throw new AppError(
        "INVALID",
        "Explain why this opportunity rather than the alternatives — at least a few full sentences.",
      );
    }
    const counts = await groupCounts(group.id);
    if (counts.prefs < counts.active) {
      throw new AppError(
        "PREFERENCES",
        `Every active member must record a preference first (${counts.prefs} of ${counts.active} so far).`,
      );
    }
    const sql = await getSql();
    const open = await sql<{ id: string }>`
      select id from venture_proposals where group_id = ${group.id} and status = 'open' limit 1
    `;
    if (open[0]) {
      throw new AppError(
        "OPEN_PROPOSAL",
        "There is already a proposal on the table. Endorse or object to it first.",
      );
    }
    const opp = await sql<{ id: string; problem: string }>`
      select id, problem from opportunities
      where id = ${data.opportunityId} and group_id = ${group.id} and status <> 'draft'
      limit 1
    `;
    if (!opp[0]) throw new AppError("NOT_FOUND", "That opportunity cannot be proposed.");

    const id = newId();
    const name = data.name.trim() || opp[0].problem.slice(0, 80);
    await sql`
      insert into venture_proposals (id, group_id, opportunity_id, proposed_by_student_id, name, rationale)
      values (${id}, ${group.id}, ${opp[0].id}, ${student.id}, ${name}, ${rationale})
    `;
    await sql`
      insert into proposal_votes (id, proposal_id, student_id, vote, comment)
      values (${newId()}, ${id}, ${student.id}, 'endorse', 'Proposer')
    `;
    if (group.status === "selection_ready") {
      await sql`update groups set status = 'selection', updated_at = now() where id = ${group.id}`;
    }
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "PROPOSAL_CREATED",
      entityType: "venture_proposal",
      entityId: id,
    });

    // Demonstration cohorts: synthetic peers cannot sign in to vote, so they
    // endorse automatically (and say so) — otherwise one real student could
    // never walk past this step alone.
    await withRlsBypass(async () => {
      const synthetic = await sql<{ id: string }>`
        select s.id from group_members gm join students s on s.id = gm.student_id
        where gm.group_id = ${group.id} and gm.membership_status = 'active' and s.is_synthetic = true
      `;
      for (const peer of synthetic) {
        await sql`
          insert into proposal_votes (id, proposal_id, student_id, vote, comment)
          values (${newId()}, ${id}, ${peer.id}, 'endorse', 'Demonstration peer — endorses automatically.')
          on conflict (proposal_id, student_id) do nothing
        `;
      }
    });

    const status = await settleProposal(id, student.id);
    return { id, status };
  });

export const voteOnProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { proposalId: string; vote: "endorse" | "object"; comment: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    await assertGroupMember(student.id, group.id);
    if (data.vote !== "endorse" && data.vote !== "object") {
      throw new AppError("INVALID", "Endorse or object.");
    }
    const comment = data.comment.trim();
    if (data.vote === "object" && comment.length < MIN_OBJECTION) {
      throw new AppError("INVALID", "Say why you object — your reasoning goes on the record.");
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string }>`
      select id, status from venture_proposals
      where id = ${data.proposalId} and group_id = ${group.id} limit 1
    `;
    if (!rows[0]) throw new AppError("NOT_FOUND", "That proposal is not in your group.");
    if (rows[0].status !== "open") throw new AppError("CLOSED", "That proposal is already decided.");
    await sql`
      insert into proposal_votes (id, proposal_id, student_id, vote, comment)
      values (${newId()}, ${data.proposalId}, ${student.id}, ${data.vote}, ${comment})
      on conflict (proposal_id, student_id)
      do update set vote = excluded.vote, comment = excluded.comment, updated_at = now()
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: data.vote === "endorse" ? "PROPOSAL_ENDORSED" : "PROPOSAL_OBJECTED",
      entityType: "venture_proposal",
      entityId: data.proposalId,
    });
    const status = await settleProposal(data.proposalId, student.id);
    return { status };
  });

export const withdrawProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { proposalId: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update venture_proposals set status = 'withdrawn', resolved_at = now(), updated_at = now()
      where id = ${data.proposalId} and group_id = ${group.id}
        and proposed_by_student_id = ${student.id} and status = 'open'
      returning id
    `;
    if (!rows[0]) throw new AppError("NOT_FOUND", "Only the proposer can withdraw an open proposal.");
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "PROPOSAL_WITHDRAWN",
      entityType: "venture_proposal",
      entityId: data.proposalId,
    });
    return { ok: true };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reason: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "You are not in a group.");
    const reason = data.reason.trim();
    if (reason.length < 5) throw new AppError("INVALID", "Give a short reason — it stays on the record.");
    const sql = await getSql();
    await sql`
      update group_members
      set membership_status = 'left', status_reason = ${reason},
          status_changed_at = now(), status_changed_by = ${context.userId}
      where group_id = ${group.id} and student_id = ${student.id} and membership_status = 'active'
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "GROUP_LEFT",
      entityType: "group",
      entityId: group.id,
      metadata: { reason },
    });
    await refreshGroupStatus(group.id);
    await resettleOpenProposal(group.id, student.id);
    return { ok: true };
  });
