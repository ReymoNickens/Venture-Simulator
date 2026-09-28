import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { CANVAS_BLOCKS, FEASIBILITY_LENSES, PLAN_SECTIONS, PROTOTYPE_KINDS, STAGES, VERDICTS } from "@/lib/domain/stages";
import { parseFinanceInputs } from "@/lib/domain/finance";
import { DEFAULT_MAX_PHOTO_BYTES } from "@/lib/domain/config";
import { AppError, loadGroupForStudent, logEvent, requireStudent } from "./authz";
import {
  insertEvidence,
  linkAssumption,
  oneOf,
  ownEvidenceIds,
  requireText,
  requireVenture,
  settleDecision,
} from "./venture-core";

// Server functions for stops 5–11. This module is imported by the browser,
// so it exports server functions only (helpers live in venture-core.ts).

const WOULD_PAY = ["yes", "maybe", "no", "not_asked"] as const;
const CHANNELS = ["in_person", "phone", "whatsapp", "other"] as const;

export const logInterview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      clientId?: string;
      intervieweeProfile: string;
      segment?: string;
      location?: string;
      conductedOn?: string | null;
      channel?: string;
      consent: boolean;
      keyQuotes: string;
      pains?: string;
      currentSolution?: string;
      spendSignal?: string;
      wouldPay?: string;
      painLevel?: number | null;
      surprise?: string;
      assumptionId?: string | null;
      relationship?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    if (!data.consent) {
      throw new AppError(
        "CONSENT",
        "Only record an interview when the person agreed to be interviewed for a class project.",
      );
    }
    const profile = requireText(data.intervieweeProfile, "Who you spoke to", 5);
    const quotes = requireText(data.keyQuotes, "What they actually said", 15);
    const sql = await getSql();
    const id = data.clientId || newId();
    const dup = await sql<{ id: string }>`select id from interviews where id = ${id} limit 1`;
    if (dup[0]) return { id };

    const evidenceId = newId();
    const pains = String(data.pains ?? "").trim();
    const spend = String(data.spendSignal ?? "").trim();
    await insertEvidence({
      id: evidenceId,
      ventureId,
      studentId: student.id,
      title: `Interview: ${profile}`,
      content: [
        `“${quotes}”`,
        pains && `Pains: ${pains}`,
        data.currentSolution && `Today they: ${String(data.currentSolution).trim()}`,
        spend && `Spend: ${spend}`,
      ]
        .filter(Boolean)
        .join("\n"),
      sourceType: "interview",
      classification: "evidence",
      observedAt: data.conductedOn ?? null,
      locationContext: data.location ?? null,
    });
    const painLevel =
      data.painLevel === null || data.painLevel === undefined
        ? null
        : Math.min(5, Math.max(1, Math.round(Number(data.painLevel))));
    await sql`
      insert into interviews (
        id, venture_id, student_id, evidence_item_id, interviewee_profile, segment, location,
        conducted_on, channel, consent, key_quotes, pains, current_solution, spend_signal,
        would_pay, pain_level, surprise
      ) values (
        ${id}, ${ventureId}, ${student.id}, ${evidenceId}, ${profile},
        ${String(data.segment ?? "").trim()}, ${String(data.location ?? "").trim()},
        ${data.conductedOn ?? null}, ${oneOf(data.channel ?? "in_person", CHANNELS, "channel")},
        true, ${quotes}, ${pains}, ${String(data.currentSolution ?? "").trim()}, ${spend},
        ${oneOf(data.wouldPay ?? "not_asked", WOULD_PAY, "answer")}, ${painLevel},
        ${String(data.surprise ?? "").trim()}
      )
    `;
    await linkAssumption({
      assumptionId: data.assumptionId,
      relationship: data.relationship,
      evidenceId,
      ventureId,
      studentId: student.id,
    });
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "INTERVIEW_LOGGED",
      entityType: "interview",
      entityId: id,
    });
    return { id };
  });

export const addCanvasEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId?: string; block: string; body: string; evidenceIds?: string[] }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const block = oneOf(
      data.block,
      CANVAS_BLOCKS.map((b) => b.key),
      "canvas block",
    );
    const body = requireText(data.body, "The entry", 3);
    const sql = await getSql();
    const id = data.clientId || newId();
    const dup = await sql<{ id: string }>`select id from canvas_entries where id = ${id} limit 1`;
    if (dup[0]) return { id };
    await sql`
      insert into canvas_entries (id, venture_id, student_id, block, body)
      values (${id}, ${ventureId}, ${student.id}, ${block}, ${body})
    `;
    for (const ev of await ownEvidenceIds(ventureId, data.evidenceIds)) {
      await sql`
        insert into canvas_entry_evidence (id, entry_id, evidence_item_id, created_by_student_id)
        values (${newId()}, ${id}, ${ev}, ${student.id})
        on conflict (entry_id, evidence_item_id) do nothing
      `;
    }
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "CANVAS_ENTRY_ADDED",
      entityType: "canvas_entry",
      entityId: id,
      metadata: { block },
    });
    return { id };
  });

export const linkCanvasEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { entryId: string; evidenceIds: string[] }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const sql = await getSql();
    const entry = await sql<{ id: string }>`
      select id from canvas_entries where id = ${data.entryId} and venture_id = ${ventureId} limit 1
    `;
    if (!entry[0]) throw new AppError("NOT_FOUND", "That canvas entry is not in your venture.");
    const ids = await ownEvidenceIds(ventureId, data.evidenceIds);
    for (const ev of ids) {
      await sql`
        insert into canvas_entry_evidence (id, entry_id, evidence_item_id, created_by_student_id)
        values (${newId()}, ${data.entryId}, ${ev}, ${student.id})
        on conflict (entry_id, evidence_item_id) do nothing
      `;
    }
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "CANVAS_EVIDENCE_LINKED",
      entityType: "canvas_entry",
      entityId: data.entryId,
      metadata: { count: ids.length },
    });
    return { linked: ids.length };
  });

export const retireCanvasEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { entryId: string; reason: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const reason = requireText(data.reason, "Why it no longer holds", 5);
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update canvas_entries
      set status = 'retired', retired_reason = ${reason}, retired_at = now(), updated_at = now()
      where id = ${data.entryId} and venture_id = ${ventureId} and status = 'active'
      returning id
    `;
    if (!rows[0]) throw new AppError("NOT_FOUND", "That entry is not active in your canvas.");
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "CANVAS_ENTRY_RETIRED",
      entityType: "canvas_entry",
      entityId: data.entryId,
    });
    return { ok: true };
  });

export const assessFeasibility = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { lens: string; verdict: string; reasoning: string; evidenceIds?: string[] }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const lens = oneOf(
      data.lens,
      FEASIBILITY_LENSES.map((l) => l.key),
      "lens",
    );
    const verdict = oneOf(
      data.verdict,
      VERDICTS.map((v) => v.value),
      "verdict",
    );
    const reasoning = requireText(data.reasoning, "Your reasoning", 40);
    const evidenceIds = await ownEvidenceIds(ventureId, data.evidenceIds);
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into feasibility_assessments (id, venture_id, student_id, lens, verdict, reasoning, evidence_ids)
      values (${id}, ${ventureId}, ${student.id}, ${lens}, ${verdict}, ${reasoning}, ${JSON.stringify(evidenceIds)})
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "FEASIBILITY_ASSESSED",
      entityType: "feasibility_assessment",
      entityId: id,
      metadata: { lens, verdict },
    });
    return { id };
  });

export const saveFinanceModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { inputs: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    if (typeof data.inputs !== "string" || data.inputs.length > 50_000) {
      throw new AppError("INVALID", "Those numbers could not be saved.");
    }
    const parsed = parseFinanceInputs(data.inputs);
    // Evidence links must point at this venture's own evidence.
    const valid = new Set(
      await ownEvidenceIds(ventureId, [
        parsed.priceEvidenceId,
        ...parsed.variableCosts.map((l) => l.evidenceId),
        ...parsed.fixedCosts.map((l) => l.evidenceId),
        ...parsed.startupCosts.map((l) => l.evidenceId),
      ].filter(Boolean)),
    );
    const scrub = <T extends { evidenceId?: string | null }>(l: T) => ({
      ...l,
      evidenceId: l.evidenceId && valid.has(l.evidenceId) ? l.evidenceId : null,
    });
    const clean = {
      ...parsed,
      priceEvidenceId: parsed.priceEvidenceId && valid.has(parsed.priceEvidenceId) ? parsed.priceEvidenceId : null,
      variableCosts: parsed.variableCosts.map(scrub),
      fixedCosts: parsed.fixedCosts.map(scrub),
      startupCosts: parsed.startupCosts.map(scrub),
    };
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into financial_models (id, venture_id, student_id, inputs, note)
      values (${id}, ${ventureId}, ${student.id}, ${JSON.stringify(clean)}, ${String(data.note ?? "").trim()})
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "FINANCE_SAVED",
      entityType: "financial_model",
      entityId: id,
    });
    return { id };
  });

export const createPrototype = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      title: string;
      kind: string;
      description: string;
      learningGoal: string;
      costGhs: number;
      photoData?: string | null;
      photoMime?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const title = requireText(data.title, "A name for the prototype", 3);
    const kind = oneOf(
      data.kind,
      PROTOTYPE_KINDS.map((k) => k.value),
      "prototype type",
    );
    const learningGoal = requireText(data.learningGoal, "What it should teach you", 10);
    const cost = Math.max(0, Number(data.costGhs) || 0);
    if (data.photoData) {
      if (data.photoData.length > DEFAULT_MAX_PHOTO_BYTES * 1.4) {
        throw new AppError("PHOTO", "The photo is too large.");
      }
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.photoData)) {
        throw new AppError("PHOTO", "Only JPEG, PNG or WebP photos can be attached.");
      }
    }
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into prototypes (id, venture_id, student_id, title, kind, description, learning_goal, cost_ghs, photo_data, photo_mime)
      values (${id}, ${ventureId}, ${student.id}, ${title}, ${kind}, ${String(data.description ?? "").trim()},
              ${learningGoal}, ${cost}, ${data.photoData ?? null}, ${data.photoMime ?? null})
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "PROTOTYPE_CREATED",
      entityType: "prototype",
      entityId: id,
    });
    return { id };
  });

export const getPrototypePhoto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ photo_data: string | null }>`
      select photo_data from prototypes where id = ${data.id} limit 1
    `;
    if (!rows[0]?.photo_data) throw new AppError("NOT_FOUND", "Photo not found.");
    return { dataUrl: rows[0].photo_data };
  });

export const logPrototypeTest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      clientId?: string;
      prototypeId: string;
      testerProfile: string;
      task?: string;
      observed: string;
      quote?: string;
      outcome: string;
      wouldPay?: string;
      assumptionId?: string | null;
      relationship?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const sql = await getSql();
    const proto = await sql<{ id: string; title: string }>`
      select id, title from prototypes where id = ${data.prototypeId} and venture_id = ${ventureId} limit 1
    `;
    if (!proto[0]) throw new AppError("NOT_FOUND", "That prototype is not in your venture.");
    const tester = requireText(data.testerProfile, "Who tested it", 5);
    const observed = requireText(data.observed, "What you saw happen", 15);
    const outcome = oneOf(data.outcome, ["succeeded", "struggled", "failed"] as const, "outcome");
    const id = data.clientId || newId();
    const dup = await sql<{ id: string }>`select id from prototype_tests where id = ${id} limit 1`;
    if (dup[0]) return { id };
    const evidenceId = newId();
    const quote = String(data.quote ?? "").trim();
    await insertEvidence({
      id: evidenceId,
      ventureId,
      studentId: student.id,
      title: `Test of “${proto[0].title}”: ${tester}`,
      content: [`Outcome: ${outcome}`, observed, quote && `“${quote}”`].filter(Boolean).join("\n"),
      sourceType: "observation",
      classification: "evidence",
    });
    await sql`
      insert into prototype_tests (
        id, prototype_id, venture_id, student_id, evidence_item_id, tester_profile, task,
        observed, quote, outcome, would_pay
      ) values (
        ${id}, ${proto[0].id}, ${ventureId}, ${student.id}, ${evidenceId}, ${tester},
        ${String(data.task ?? "").trim()}, ${observed}, ${quote}, ${outcome},
        ${oneOf(data.wouldPay ?? "not_asked", WOULD_PAY, "answer")}
      )
    `;
    await linkAssumption({
      assumptionId: data.assumptionId,
      relationship: data.relationship,
      evidenceId,
      ventureId,
      studentId: student.id,
    });
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "PROTOTYPE_TESTED",
      entityType: "prototype_test",
      entityId: id,
      metadata: { outcome },
    });
    return { id };
  });

export const proposeDecision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { decision: string; rationale: string; whatChanges?: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const decision = oneOf(data.decision, ["persevere", "pivot", "stop"] as const, "decision");
    const rationale = requireText(data.rationale, "The reasoning", 80);
    const whatChanges = String(data.whatChanges ?? "").trim();
    if (decision === "pivot" && whatChanges.length < 20) {
      throw new AppError("INVALID", "Say what changes in the pivot — customer, problem, solution or model.");
    }
    const sql = await getSql();
    const open = await sql<{ id: string }>`
      select id from venture_decisions where venture_id = ${ventureId} and status = 'open' limit 1
    `;
    if (open[0]) throw new AppError("OPEN_DECISION", "A decision is already on the table. Vote on it first.");
    const id = newId();
    await sql`
      insert into venture_decisions (id, venture_id, proposed_by_student_id, decision, rationale, what_changes)
      values (${id}, ${ventureId}, ${student.id}, ${decision}, ${rationale}, ${whatChanges})
    `;
    await sql`
      insert into decision_votes (id, decision_id, student_id, vote, comment)
      values (${newId()}, ${id}, ${student.id}, 'endorse', 'Proposer')
    `;
    await withRlsBypass(async () => {
      const synthetic = await sql<{ id: string }>`
        select s.id from group_members gm join students s on s.id = gm.student_id
        where gm.group_id = ${group.id} and gm.membership_status = 'active' and s.is_synthetic = true
      `;
      for (const peer of synthetic) {
        await sql`
          insert into decision_votes (id, decision_id, student_id, vote, comment)
          values (${newId()}, ${id}, ${peer.id}, 'endorse', 'Demonstration peer — endorses automatically.')
          on conflict (decision_id, student_id) do nothing
        `;
      }
    });
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "DECISION_PROPOSED",
      entityType: "venture_decision",
      entityId: id,
      metadata: { decision },
    });
    const status = await settleDecision(id, student.id);
    return { id, status };
  });

export const voteOnDecision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { decisionId: string; vote: "endorse" | "object"; comment: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const vote = oneOf(data.vote, ["endorse", "object"] as const, "vote");
    const comment = String(data.comment ?? "").trim();
    if (vote === "object" && comment.length < 15) {
      throw new AppError("INVALID", "Say why you object — your reasoning goes on the record.");
    }
    const sql = await getSql();
    const d = await sql<{ id: string; status: string }>`
      select id, status from venture_decisions where id = ${data.decisionId} and venture_id = ${ventureId} limit 1
    `;
    if (!d[0]) throw new AppError("NOT_FOUND", "That decision is not in your venture.");
    if (d[0].status !== "open") throw new AppError("CLOSED", "That decision is already settled.");
    await sql`
      insert into decision_votes (id, decision_id, student_id, vote, comment)
      values (${newId()}, ${d[0].id}, ${student.id}, ${vote}, ${comment})
      on conflict (decision_id, student_id)
      do update set vote = excluded.vote, comment = excluded.comment, updated_at = now()
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: vote === "endorse" ? "DECISION_ENDORSED" : "DECISION_OBJECTED",
      entityType: "venture_decision",
      entityId: d[0].id,
    });
    return { status: await settleDecision(d[0].id, student.id) };
  });

export const savePlanSection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { section: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const section = oneOf(
      data.section,
      PLAN_SECTIONS.map((p) => p.key),
      "section",
    );
    const body = requireText(data.body, "The section", 60);
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into plan_sections (id, venture_id, student_id, section, body)
      values (${id}, ${ventureId}, ${student.id}, ${section}, ${body})
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "PLAN_SECTION_SAVED",
      entityType: "plan_section",
      entityId: id,
      metadata: { section },
    });
    return { id };
  });

export const saveReflection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { stage: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const stage = oneOf(
      data.stage,
      STAGES.map((s) => s.id),
      "stage",
    );
    const body = requireText(data.body, "Your reflection", 60);
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into reflections (id, student_id, group_id, stage, body)
      values (${id}, ${student.id}, ${group.id}, ${stage}, ${body})
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "REFLECTION_WRITTEN",
      entityType: "reflection",
      entityId: id,
      metadata: { stage },
    });
    return { id };
  });

export const ratePeers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { ratings: { studentId: string; score: number; comment?: string }[] }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const members = await sql<{ student_id: string }>`
      select student_id from group_members
      where group_id = ${group.id} and membership_status = 'active' and student_id <> ${student.id}
    `;
    const allowed = new Set(members.map((m) => m.student_id));
    let saved = 0;
    for (const r of Array.isArray(data.ratings) ? data.ratings : []) {
      if (!allowed.has(r.studentId)) continue;
      const score = Math.round(Number(r.score));
      if (!(score >= 1 && score <= 5)) continue;
      await sql`
        insert into peer_ratings (id, group_id, rater_student_id, ratee_student_id, score, comment)
        values (${newId()}, ${group.id}, ${student.id}, ${r.studentId}, ${score}, ${String(r.comment ?? "").trim()})
        on conflict (group_id, rater_student_id, ratee_student_id)
        do update set score = excluded.score, comment = excluded.comment, updated_at = now()
      `;
      saved += 1;
    }
    if (saved) {
      await logEvent({
        studentId: student.id,
        groupId: group.id,
        eventType: "PEERS_RATED",
        entityType: "group",
        entityId: group.id,
        metadata: { count: saved },
      });
    }
    return { saved };
  });

export const respondToMarketEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { eventId: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const body = requireText(data.body, "Your response", 40);
    const sql = await getSql();
    const ev = await sql<{ id: string }>`
      select id from market_events
      where id = ${data.eventId} and course_offering_id = ${group.courseOfferingId}
        and (group_id is null or group_id = ${group.id})
      limit 1
    `;
    if (!ev[0]) throw new AppError("NOT_FOUND", "That market event is not for your group.");
    await sql`
      insert into event_responses (id, event_id, group_id, student_id, body)
      values (${newId()}, ${ev[0].id}, ${group.id}, ${student.id}, ${body})
      on conflict (event_id, student_id) do update set body = excluded.body, updated_at = now()
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      eventType: "MARKET_EVENT_RESPONDED",
      entityType: "market_event",
      entityId: ev[0].id,
    });
    return { ok: true };
  });

export const setAssumptionStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assumptionId: string; status: string; confidence?: string }) => input)
  .handler(async ({ context, data }) => {
    const { student, group, ventureId } = await requireVenture(context.userId);
    const status = oneOf(data.status, ["open", "testing", "supported", "challenged"] as const, "status");
    const confidence = data.confidence
      ? oneOf(data.confidence, ["high", "medium", "low"] as const, "confidence")
      : null;
    const sql = await getSql();
    // Assumptions belong to their author under assumptions_write RLS, but
    // "we tested it and it held / broke" is a group judgement about the
    // venture's shared ledger, recorded in the activity log with who did it.
    const rows = await withRlsBypass(
      () => sql<{ id: string }>`
        update assumptions
        set status = ${status},
            confidence = coalesce(${confidence}, confidence),
            updated_at = now()
        where id = ${data.assumptionId} and venture_id = ${ventureId}
        returning id
      `,
    );
    if (!rows[0]) throw new AppError("NOT_FOUND", "That assumption is not in your venture.");
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId,
      eventType: "ASSUMPTION_STATUS",
      entityType: "assumption",
      entityId: data.assumptionId,
      metadata: { status },
    });
    return { ok: true };
  });
