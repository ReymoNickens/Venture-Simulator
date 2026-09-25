// "Test": pick an assumption, design a small experiment with a success line decided in
// advance, run it, and record what happened. The assumption's status and confidence move
// with the result, and every change is kept as history.
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import { VALID } from "@/lib/domain/config";
import { assumptionAfterExperiment } from "@/lib/domain/state-machine";
import type { AssumptionStatus, Confidence, ExperimentResult } from "@/lib/domain/types";
import { AppError, loadGroupForStudent, logEvent, requireStudent } from "./authz";

async function ventureCtx(userId: string) {
  const student = await requireStudent(userId);
  const group = await loadGroupForStudent(student.id);
  if (!group) throw new AppError("NO_GROUP", "Join a group first.");
  const sql = await getSql();
  const [v] = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
  if (!v) throw new AppError("NO_VENTURE", "Your group needs a venture before running tests.");
  return { student, group, ventureId: v.id, sql };
}

async function recordRevision(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: { assumptionId: string; studentId: string; from: { status: string; confidence: string }; to: { status: string; confidence: string }; experimentId?: string | null; reason: string },
) {
  if (input.from.status === input.to.status && input.from.confidence === input.to.confidence) return;
  await sql`
    insert into assumption_revisions (id, assumption_id, student_id, confidence_from, confidence_to, status_from, status_to, experiment_id, reason)
    values (${newId()}, ${input.assumptionId}, ${input.studentId}, ${input.from.confidence}, ${input.to.confidence},
            ${input.from.status}, ${input.to.status}, ${input.experimentId ?? null}, ${input.reason.slice(0, 500)})
  `;
  await sql`
    update assumptions set status = ${input.to.status}, confidence = ${input.to.confidence}, updated_at = now()
    where id = ${input.assumptionId}
  `;
}

export const planExperiment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientId?: string;
    assumptionId: string;
    hypothesis: string;
    method: string;
    successCriteria: string;
    sampleTarget?: number | null;
  }) => input)
  .handler(async ({ context, data }) => {
    if (!VALID.method.has(data.method)) throw new AppError("INVALID", "Pick how you'll test it.");
    const hypothesis = data.hypothesis.trim().slice(0, 600);
    const successCriteria = data.successCriteria.trim().slice(0, 600);
    if (hypothesis.length < 10) throw new AppError("INVALID", "Write what you believe, as something that could turn out wrong.");
    if (successCriteria.length < 10) throw new AppError("INVALID", "Decide in advance what result would count as success.");
    const sample = data.sampleTarget == null ? null : Math.round(Number(data.sampleTarget));
    if (sample !== null && (!Number.isFinite(sample) || sample < 1 || sample > 10000)) throw new AppError("INVALID", "Sample size should be a number like 10.");
    const { student, group, ventureId, sql } = await ventureCtx(context.userId);
    const [a] = await sql<{ id: string; status: string; confidence: string }>`
      select id, status, confidence from assumptions where id = ${data.assumptionId} and venture_id = ${ventureId} limit 1
    `;
    if (!a) throw new AppError("NOT_FOUND", "That assumption isn't in your venture.");
    const id = data.clientId || newId();
    const dup = await sql<{ id: string }>`select id from experiments where id = ${id} limit 1`;
    if (dup[0]) return { id };
    await sql`
      insert into experiments (id, venture_id, assumption_id, student_id, hypothesis, method, success_criteria, sample_target, status)
      values (${id}, ${ventureId}, ${a.id}, ${student.id}, ${hypothesis}, ${data.method}, ${successCriteria}, ${sample}, 'planned')
    `;
    if (a.status === "open") {
      await recordRevision(sql, { assumptionId: a.id, studentId: student.id, from: a, to: { status: "testing", confidence: a.confidence }, experimentId: id, reason: "Test planned" });
    }
    await logEvent({ studentId: student.id, groupId: group.id, ventureId, eventType: "EXPERIMENT_PLANNED", entityType: "experiment", entityId: id, metadata: { assumptionId: a.id, method: data.method } });
    return { id };
  });

export const completeExperiment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    experimentId: string;
    result: string;
    learning: string;
    confidenceAfter?: string | null;
    evidenceIds?: string[];
  }) => input)
  .handler(async ({ context, data }) => {
    if (!VALID.result.has(data.result)) throw new AppError("INVALID", "Say whether the assumption held up.");
    if (data.confidenceAfter && !VALID.confidence.has(data.confidenceAfter)) throw new AppError("INVALID", "Pick a confidence level.");
    const learning = data.learning.trim().slice(0, 2000);
    if (learning.length < 20) throw new AppError("INVALID", "Write what you learned — what did you see, and what does it change?");
    const { student, group, ventureId, sql } = await ventureCtx(context.userId);
    const [x] = await sql<{ id: string; assumption_id: string; status: string }>`
      select id, assumption_id, status from experiments where id = ${data.experimentId} and venture_id = ${ventureId} limit 1
    `;
    if (!x) throw new AppError("NOT_FOUND", "That test isn't in your venture.");
    if (x.status === "done") throw new AppError("DONE", "This test already has a result. Plan a new one to test again.");
    const evidenceIds = [...new Set((data.evidenceIds ?? []).map(String))].slice(0, 20);
    if (evidenceIds.length) {
      const found = await sql<{ id: string }>`select id from evidence_items where venture_id = ${ventureId} and id = any(${evidenceIds})`;
      if (found.length !== evidenceIds.length) throw new AppError("NOT_FOUND", "Some of that evidence isn't in your venture.");
    }
    if (data.result !== "inconclusive" && !evidenceIds.length) {
      throw new AppError("EVIDENCE", "Attach the evidence you collected. A result without evidence is just an opinion.");
    }
    const result = data.result as ExperimentResult;
    await sql`
      update experiments set status = 'done', result = ${result}, learning = ${learning},
        completed_by_student_id = ${student.id}, completed_at = now(), updated_at = now()
      where id = ${x.id}
    `;
    for (const evId of evidenceIds) {
      await sql`insert into experiment_evidence (id, experiment_id, evidence_item_id) values (${newId()}, ${x.id}, ${evId}) on conflict do nothing`;
      if (result !== "inconclusive") {
        await sql`
          insert into assumption_evidence (id, assumption_id, evidence_item_id, relationship_type, created_by_student_id)
          values (${newId()}, ${x.assumption_id}, ${evId}, ${result}, ${student.id})
          on conflict (assumption_id, evidence_item_id, relationship_type) do nothing
        `;
      }
    }
    const [a] = await sql<{ status: string; confidence: string }>`select status, confidence from assumptions where id = ${x.assumption_id}`;
    const next = assumptionAfterExperiment(result, { status: a.status as AssumptionStatus, confidence: a.confidence as Confidence }, (data.confidenceAfter as Confidence) ?? null);
    await recordRevision(sql, { assumptionId: x.assumption_id, studentId: student.id, from: a, to: next, experimentId: x.id, reason: learning });
    await logEvent({ studentId: student.id, groupId: group.id, ventureId, eventType: "EXPERIMENT_COMPLETED", entityType: "experiment", entityId: x.id, metadata: { result } });
    return { ok: true, assumption: next };
  });

/** Change confidence by hand — allowed, but always with a reason, and always kept as history. */
export const reviseAssumption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assumptionId: string; confidence: string; reason: string }) => input)
  .handler(async ({ context, data }) => {
    if (!VALID.confidence.has(data.confidence)) throw new AppError("INVALID", "Pick a confidence level.");
    const reason = data.reason.trim();
    if (reason.length < 10) throw new AppError("INVALID", "Say what changed your mind.");
    const { student, group, ventureId, sql } = await ventureCtx(context.userId);
    const [a] = await sql<{ id: string; status: string; confidence: string }>`
      select id, status, confidence from assumptions where id = ${data.assumptionId} and venture_id = ${ventureId} limit 1
    `;
    if (!a) throw new AppError("NOT_FOUND", "That assumption isn't in your venture.");
    await recordRevision(sql, { assumptionId: a.id, studentId: student.id, from: a, to: { status: a.status, confidence: data.confidence }, reason });
    await logEvent({ studentId: student.id, groupId: group.id, ventureId, eventType: "ASSUMPTION_REVISED", entityType: "assumption", entityId: a.id, metadata: { from: a.confidence, to: data.confidence } });
    return { ok: true };
  });
