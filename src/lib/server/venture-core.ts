import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { evaluateProposal } from "@/lib/domain/state-machine";
import type { Group, Student } from "@/lib/domain/types";
import { AppError, loadGroupForStudent, logEvent, requireStudent } from "./authz";
import { groupCounts } from "./governance-core";

// Server-only helpers for venture-work.ts. Never import from client code.

export interface VentureContext {
  student: Student;
  group: Group;
  ventureId: string;
}

export async function requireVenture(userId: string): Promise<VentureContext> {
  const student = await requireStudent(userId);
  const group = await loadGroupForStudent(student.id);
  if (!group) throw new AppError("NO_GROUP", "Join a group first.");
  const sql = await getSql();
  const v = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
  if (!v[0]) throw new AppError("NO_VENTURE", "Your group has not chosen a venture yet.");
  return { student, group, ventureId: v[0].id };
}

export function requireText(value: unknown, label: string, min = 1): string {
  const v = String(value ?? "").trim();
  if (v.length < min) {
    throw new AppError(
      "INVALID",
      min > 1 ? `${label} needs a bit more — at least ${min} characters.` : `${label} is required.`,
    );
  }
  if (v.length > 5000) throw new AppError("INVALID", `${label} is too long.`);
  return v;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const v = String(value ?? "") as T;
  if (!allowed.includes(v)) throw new AppError("INVALID", `Choose a valid ${label}.`);
  return v;
}

/** Evidence ids that genuinely belong to this venture — anything else is dropped. */
export async function ownEvidenceIds(ventureId: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || !ids.length) return [];
  const wanted = [...new Set(ids.map(String))].slice(0, 30);
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `select id from evidence_items where venture_id = $1 and id = any($2::text[])`,
    [ventureId, wanted],
  );
  return rows.map((r) => r.id);
}

/**
 * Field work (interviews, prototype tests) is also evidence, so it can be
 * linked to assumptions and canvas blocks like anything else in the record.
 */
export async function insertEvidence(input: {
  id: string;
  ventureId: string;
  studentId: string;
  title: string;
  content: string;
  sourceType: string;
  classification: string;
  observedAt?: string | null;
  locationContext?: string | null;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into evidence_items (
      id, venture_id, student_id, title, content, source_type, classification,
      observed_at, location_context
    ) values (
      ${input.id}, ${input.ventureId}, ${input.studentId}, ${input.title.slice(0, 200)},
      ${input.content}, ${input.sourceType}, ${input.classification},
      ${input.observedAt ?? null}, ${input.locationContext ?? null}
    )
  `;
}

export async function linkAssumption(input: {
  assumptionId: string | null | undefined;
  relationship: string | null | undefined;
  evidenceId: string;
  ventureId: string;
  studentId: string;
}): Promise<void> {
  if (!input.assumptionId) return;
  const rel = input.relationship === "challenges" ? "challenges" : "supports";
  const sql = await getSql();
  const a = await sql<{ id: string }>`
    select id from assumptions where id = ${input.assumptionId} and venture_id = ${input.ventureId} limit 1
  `;
  if (!a[0]) return;
  await sql`
    insert into assumption_evidence (id, assumption_id, evidence_item_id, relationship_type, created_by_student_id)
    values (${newId()}, ${a[0].id}, ${input.evidenceId}, ${rel}, ${input.studentId})
    on conflict (assumption_id, evidence_item_id, relationship_type) do nothing
  `;
}

/** Same rule as venture proposals: ratified by majority, closed once impossible. */
export async function settleDecision(decisionId: string, actingStudentId: string | null): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ id: string; venture_id: string; decision: string; status: string; group_id: string }>`
    select d.id, d.venture_id, d.decision, d.status, v.group_id
    from venture_decisions d join ventures v on v.id = d.venture_id
    where d.id = ${decisionId} limit 1
  `;
  const d = rows[0];
  if (!d || d.status !== "open") return d?.status ?? "missing";
  const counts = await groupCounts(d.group_id);
  const tally = await withRlsBypass(
    () => sql<{ endorse: number; object: number }>`
      select
        count(*) filter (where v.vote = 'endorse')::int as endorse,
        count(*) filter (where v.vote = 'object')::int as object
      from decision_votes v
      join group_members gm on gm.student_id = v.student_id and gm.group_id = ${d.group_id}
      where v.decision_id = ${d.id} and gm.membership_status = 'active'
    `,
  );
  const outcome = evaluateProposal({
    activeMembers: counts.active,
    endorsements: Number(tally[0]?.endorse ?? 0),
    objections: Number(tally[0]?.object ?? 0),
    quorumPct: counts.quorum,
  });
  if (outcome === "open") return "open";
  await sql`
    update venture_decisions set status = ${outcome}, resolved_at = now(), updated_at = now()
    where id = ${d.id}
  `;
  if (outcome === "ratified") {
    const ventureStatus = d.decision === "stop" ? "killed" : d.decision === "pivot" ? "pivoted" : "active";
    await sql`update ventures set status = ${ventureStatus}, updated_at = now() where id = ${d.venture_id}`;
  }
  await withRlsBypass(() =>
    logEvent({
      studentId: actingStudentId,
      groupId: d.group_id,
      ventureId: d.venture_id,
      eventType: outcome === "ratified" ? "DECISION_RATIFIED" : "DECISION_REJECTED",
      entityType: "venture_decision",
      entityId: d.id,
      metadata: { decision: d.decision },
    }),
  );
  return outcome;
}
