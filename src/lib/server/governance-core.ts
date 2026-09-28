import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { evaluateProposal } from "@/lib/domain/state-machine";
import { logEvent } from "./authz";

// Server-only helpers behind the group-decision server functions. Kept out of
// governance.ts: a module the browser imports may export only server
// functions — any other export drags the database layer into the client
// bundle.

type ProposalRow = {
  id: string;
  group_id: string;
  opportunity_id: string;
  proposed_by_student_id: string;
  name: string;
  rationale: string;
  status: string;
};

export async function groupCounts(groupId: string) {
  const sql = await getSql();
  // Membership-wide counts decide whether the group may decide at all — a
  // system computation across every member's rows, not one student's own.
  return withRlsBypass(async () => {
    const rows = await sql<{ active: number; prefs: number; quorum: number }>`
      select
        (select count(*)::int from group_members
          where group_id = ${groupId} and membership_status = 'active') as active,
        (select count(distinct p.student_id)::int
           from opportunity_preferences p
           join opportunities o on o.id = p.opportunity_id
           join group_members gm on gm.student_id = p.student_id and gm.group_id = o.group_id
          where o.group_id = ${groupId} and gm.membership_status = 'active') as prefs,
        (select o.decision_quorum_pct from groups g
           join course_offerings o on o.id = g.course_offering_id
          where g.id = ${groupId}) as quorum
    `;
    return {
      active: Number(rows[0]?.active ?? 0),
      prefs: Number(rows[0]?.prefs ?? 0),
      quorum: Number(rows[0]?.quorum ?? 51),
    };
  });
}

/**
 * Tally a proposal and act on the outcome: create the venture once a majority
 * endorses, or close the proposal once it can no longer pass. Runs after every
 * vote, so the group never waits on a decision that is already made.
 */
export async function settleProposal(proposalId: string, actingStudentId: string): Promise<string> {
  const actor = actingStudentId || null;
  const sql = await getSql();
  const rows = await sql<ProposalRow>`
    select id, group_id, opportunity_id, proposed_by_student_id, name, rationale, status
    from venture_proposals where id = ${proposalId} limit 1
  `;
  const proposal = rows[0];
  if (!proposal || proposal.status !== "open") return proposal?.status ?? "missing";

  const counts = await groupCounts(proposal.group_id);
  const tally = await withRlsBypass(
    () => sql<{ endorse: number; object: number }>`
      select
        count(*) filter (where v.vote = 'endorse')::int as endorse,
        count(*) filter (where v.vote = 'object')::int as object
      from proposal_votes v
      join group_members gm on gm.student_id = v.student_id and gm.group_id = ${proposal.group_id}
      where v.proposal_id = ${proposal.id} and gm.membership_status = 'active'
    `,
  );
  const outcome = evaluateProposal({
    activeMembers: counts.active,
    endorsements: Number(tally[0]?.endorse ?? 0),
    objections: Number(tally[0]?.object ?? 0),
    quorumPct: counts.quorum,
  });
  if (outcome === "open") return "open";

  if (outcome === "rejected") {
    await sql`
      update venture_proposals set status = 'rejected', resolved_at = now(), updated_at = now()
      where id = ${proposal.id}
    `;
    await logEvent({
      studentId: actor,
      groupId: proposal.group_id,
      eventType: "PROPOSAL_REJECTED",
      entityType: "venture_proposal",
      entityId: proposal.id,
    });
    return "rejected";
  }

  const existing = await sql<{ id: string }>`select id from ventures where group_id = ${proposal.group_id} limit 1`;
  if (existing[0]) return "ratified";
  const ventureId = newId();
  await sql`
    insert into ventures (id, group_id, opportunity_id, name, status, selection_rationale, proposal_id)
    values (${ventureId}, ${proposal.group_id}, ${proposal.opportunity_id}, ${proposal.name},
            'active', ${proposal.rationale}, ${proposal.id})
  `;
  await sql`
    update venture_proposals set status = 'ratified', resolved_at = now(), updated_at = now()
    where id = ${proposal.id}
  `;
  // The group's ratified decision transitions every member's opportunity —
  // opportunities_write only allows writing your own row, so recording the
  // alternatives as rejected needs the escape hatch.
  await withRlsBypass(async () => {
    await sql`
      update opportunities set status = 'selected', updated_at = now()
      where id = ${proposal.opportunity_id}
    `;
    await sql`
      update opportunities set status = 'rejected', updated_at = now()
      where group_id = ${proposal.group_id} and id <> ${proposal.opportunity_id} and status = 'submitted'
    `;
    await sql`update groups set status = 'venture_created', updated_at = now() where id = ${proposal.group_id}`;
    await logEvent({
      groupId: proposal.group_id,
      ventureId,
      eventType: "VENTURE_CREATED",
      entityType: "venture",
      entityId: ventureId,
      metadata: { proposalId: proposal.id },
    });
    await logEvent({
      groupId: proposal.group_id,
      ventureId,
      eventType: "OPPORTUNITY_SELECTED",
      entityType: "opportunity",
      entityId: proposal.opportunity_id,
    });
  });
  return "ratified";
}

/**
 * Membership changed, so the arithmetic of any open proposal changed with it:
 * fewer active members may mean it now passes, or can no longer pass. Runs as
 * a system operation — the caller may no longer be an active member.
 */
export async function resettleOpenProposal(groupId: string, actingStudentId: string | null) {
  const sql = await getSql();
  await withRlsBypass(async () => {
    const open = await sql<{ id: string }>`
      select id from venture_proposals where group_id = ${groupId} and status = 'open' limit 1
    `;
    if (open[0]) await settleProposal(open[0].id, actingStudentId ?? "");
  });
}
