// The group decision. One member proposes an idea with the group's rationale; it only
// becomes the venture once enough of the group endorses it (course rule: majority or
// everyone). Nobody can decide for the group alone, and objections are on the record.
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { preferencesRevealed, proposalOutcome } from "@/lib/domain/state-machine";
import type { DecisionRule } from "@/lib/domain/types";
import { AppError, loadGroupForStudent, loadOfferingForStudent, logEvent, requireStudent, votingRoll } from "./authz";

const OPEN_STATUSES = ["selection_ready", "selection"];

async function ctx(userId: string) {
  const student = await requireStudent(userId);
  const group = await loadGroupForStudent(student.id);
  if (!group) throw new AppError("NO_GROUP", "Join a group first.");
  if (group.status === "venture_created") throw new AppError("CLOSED", "Your group has already chosen its venture.");
  if (!OPEN_STATUSES.includes(group.status)) throw new AppError("CLOSED", "Your group isn't choosing a venture right now.");
  const offering = await loadOfferingForStudent(student.id);
  const rule: DecisionRule = offering?.decisionRule ?? "majority";
  const roll = await votingRoll(group.id, Boolean(group.selectionOpenedBy));
  if (!roll.eligible.includes(student.id)) throw new AppError("NOT_ELIGIBLE", "Only members who submitted an idea take part in this decision.");
  return { student, group, rule, roll };
}

/** Counts responses from eligible voters and closes the proposal if the outcome is settled. */
async function settle(proposalId: string, groupId: string, eligible: string[], rule: DecisionRule, actorId: string) {
  const sql = await getSql();
  // Lock the group row so two final endorsements can't both create a venture.
  await withRlsBypass(() => sql`select id from groups where id = ${groupId} for update`);
  const [p] = await sql<{ id: string; status: string; opportunity_id: string; name: string; rationale: string }>`
    select id, status, opportunity_id, name, rationale from venture_proposals where id = ${proposalId} limit 1
  `;
  if (!p || p.status !== "open") return p?.status ?? "missing";
  const responses = await sql<{ student_id: string; stance: string }>`
    select student_id, stance from proposal_responses where proposal_id = ${proposalId}
  `;
  const counted = responses.filter((r) => eligible.includes(r.student_id));
  const outcome = proposalOutcome({
    endorse: counted.filter((r) => r.stance === "endorse").length,
    object: counted.filter((r) => r.stance === "object").length,
    eligible: eligible.length,
    rule,
  });
  if (outcome === "open") return "open";
  if (outcome === "rejected") {
    await sql`update venture_proposals set status = 'rejected', decided_at = now(), updated_at = now() where id = ${proposalId}`;
    await logEvent({ studentId: actorId, groupId, eventType: "PROPOSAL_REJECTED", entityType: "venture_proposal", entityId: proposalId });
    return "rejected";
  }
  const exists = await sql<{ id: string }>`select id from ventures where group_id = ${groupId} limit 1`;
  if (exists[0]) return "accepted";
  const ventureId = newId();
  await sql`
    insert into ventures (id, group_id, opportunity_id, name, status, selection_rationale, proposal_id)
    values (${ventureId}, ${groupId}, ${p.opportunity_id}, ${p.name}, 'active', ${p.rationale}, ${proposalId})
  `;
  // The group's decision moves every member's idea to selected/rejected, which needs
  // system rights (each student may only write their own opportunity row).
  await withRlsBypass(async () => {
    await sql`update opportunities set status = 'selected', updated_at = now() where id = ${p.opportunity_id}`;
    await sql`update opportunities set status = 'rejected', updated_at = now()
      where group_id = ${groupId} and id <> ${p.opportunity_id} and status = 'submitted'`;
    await sql`update groups set status = 'venture_created', updated_at = now() where id = ${groupId}`;
  });
  await sql`update venture_proposals set status = 'accepted', decided_at = now(), updated_at = now() where id = ${proposalId}`;
  await logEvent({ studentId: actorId, groupId, ventureId, eventType: "VENTURE_CREATED", entityType: "venture", entityId: ventureId, metadata: { proposalId } });
  await logEvent({ studentId: actorId, groupId, ventureId, eventType: "OPPORTUNITY_SELECTED", entityType: "opportunity", entityId: p.opportunity_id });
  return "accepted";
}

// Demo cohorts have synthetic teammates; they respond to proposals so a single student
// can walk the whole decision. Two of them push back, so objections are visible.
async function demoPeersRespond(proposalId: string, groupId: string, opportunityId: string) {
  const sql = await getSql();
  await withRlsBypass(async () => {
    const peers = await sql<{ id: string; full_name: string }>`
      select s.id, s.full_name from group_members gm join students s on s.id = gm.student_id
      where gm.group_id = ${groupId} and gm.membership_status = 'active' and s.is_synthetic = true
      order by s.full_name
    `;
    const [opp] = await sql<{ observed_evidence: string }>`select observed_evidence from opportunities where id = ${opportunityId}`;
    const hasNumbers = /\d/.test(opp?.observed_evidence ?? "");
    for (let i = 0; i < peers.length; i++) {
      const object = i === 1 || (i === 4 && !hasNumbers);
      const comment = object
        ? i === 1
          ? "I'm not convinced we've shown people would pay. I'd rather test that before committing."
          : "The evidence is mostly one person's impression. Can we count something first?"
        : ["The observation is specific and repeatable.", "It's the problem I saw most often too.", "We can test this cheaply on campus.", "Fine by me — the alternatives had weaker evidence."][i % 4];
      await sql`
        insert into proposal_responses (id, proposal_id, student_id, stance, comment)
        values (${newId()}, ${proposalId}, ${peers[i].id}, ${object ? "object" : "endorse"}, ${comment})
        on conflict (proposal_id, student_id) do nothing
      `;
    }
  });
}

export const proposeVenture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { opportunityId: string; name: string; rationale: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, rule, roll } = await ctx(context.userId);
    if (!preferencesRevealed(roll.recorded, roll.eligible.length)) {
      throw new AppError("PREFERENCES", "Everyone records their own preference before anyone proposes a decision.");
    }
    const rationale = data.rationale.trim().slice(0, 3000);
    if (rationale.length < 60) {
      throw new AppError("INVALID", "Explain why this idea rather than the others — a few sentences, naming what the others lacked.");
    }
    const sql = await getSql();
    const [opp] = await sql<{ id: string; problem: string }>`
      select id, problem from opportunities where id = ${data.opportunityId} and group_id = ${group.id} and status = 'submitted' limit 1
    `;
    if (!opp) throw new AppError("NOT_FOUND", "That idea can't be proposed.");
    const open = await sql<{ id: string }>`select id from venture_proposals where group_id = ${group.id} and status = 'open' limit 1`;
    if (open[0]) throw new AppError("EXISTS", "There's already a proposal on the table. Respond to it, or wait for it to be withdrawn.");
    const id = newId();
    const name = data.name.trim().slice(0, 80) || opp.problem.slice(0, 60);
    await sql`
      insert into venture_proposals (id, group_id, opportunity_id, proposed_by_student_id, name, rationale, status)
      values (${id}, ${group.id}, ${opp.id}, ${student.id}, ${name}, ${rationale}, 'open')
    `;
    await sql`
      insert into proposal_responses (id, proposal_id, student_id, stance, comment)
      values (${newId()}, ${id}, ${student.id}, 'endorse', 'Proposed this.')
    `;
    if (group.status === "selection_ready") {
      await withRlsBypass(() => sql`update groups set status = 'selection', updated_at = now() where id = ${group.id}`);
    }
    await logEvent({ studentId: student.id, groupId: group.id, eventType: "PROPOSAL_MADE", entityType: "venture_proposal", entityId: id, metadata: { opportunityId: opp.id } });
    const isDemo = await withRlsBypass(() => sql<{ n: number }>`
      select count(*)::int as n from group_members gm join students s on s.id = gm.student_id
      where gm.group_id = ${group.id} and s.is_synthetic = true
    `);
    if (Number(isDemo[0]?.n ?? 0) > 0) await demoPeersRespond(id, group.id, opp.id);
    return { proposalId: id, outcome: await settle(id, group.id, roll.eligible, rule, student.id) };
  });

export const respondToProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { proposalId: string; stance: "endorse" | "object"; comment?: string }) => input)
  .handler(async ({ context, data }) => {
    if (data.stance !== "endorse" && data.stance !== "object") throw new AppError("INVALID", "Endorse or object.");
    const { student, group, rule, roll } = await ctx(context.userId);
    const comment = (data.comment ?? "").trim().slice(0, 1000);
    if (data.stance === "object" && comment.length < 10) {
      throw new AppError("INVALID", "Say why you object — your group needs the reason, not just the vote.");
    }
    const sql = await getSql();
    const [p] = await sql<{ id: string; status: string }>`
      select id, status from venture_proposals where id = ${data.proposalId} and group_id = ${group.id} limit 1
    `;
    if (!p || p.status !== "open") throw new AppError("CLOSED", "That proposal is no longer open.");
    await sql`
      insert into proposal_responses (id, proposal_id, student_id, stance, comment)
      values (${newId()}, ${p.id}, ${student.id}, ${data.stance}, ${comment})
      on conflict (proposal_id, student_id) do update set stance = excluded.stance, comment = excluded.comment, updated_at = now()
    `;
    await logEvent({ studentId: student.id, groupId: group.id, eventType: data.stance === "endorse" ? "PROPOSAL_ENDORSED" : "PROPOSAL_OBJECTED", entityType: "venture_proposal", entityId: p.id });
    return { outcome: await settle(p.id, group.id, roll.eligible, rule, student.id) };
  });

export const withdrawProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { proposalId: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group } = await ctx(context.userId);
    const sql = await getSql();
    const [p] = await sql<{ id: string; proposed_by_student_id: string; status: string }>`
      select id, proposed_by_student_id, status from venture_proposals where id = ${data.proposalId} and group_id = ${group.id} limit 1
    `;
    if (!p || p.status !== "open") throw new AppError("CLOSED", "That proposal is no longer open.");
    if (p.proposed_by_student_id !== student.id) throw new AppError("FORBIDDEN", "Only the person who proposed it can withdraw it.");
    await sql`update venture_proposals set status = 'withdrawn', decided_at = now(), updated_at = now() where id = ${p.id}`;
    await logEvent({ studentId: student.id, groupId: group.id, eventType: "PROPOSAL_WITHDRAWN", entityType: "venture_proposal", entityId: p.id });
    return { ok: true };
  });
