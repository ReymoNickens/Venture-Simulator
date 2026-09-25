import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import type { AdvisorMetadata, AdvisorStage, GroupStatus } from "@/lib/domain/types";
import { VALID } from "@/lib/domain/config";
import { advisorAllowance, canViewPeerOpportunities } from "@/lib/domain/state-machine";
import { AppError, loadGroupForStudent, loadOfferingForStudent, logEvent, requireStudent } from "./authz";

const SYSTEM = `You are the AI advisor inside an experiential venture studio for university students in Ghana.

Your job is to challenge, not to encourage and not to invent a business for them.

Rules:
1. Never affirm a claim as sound. Ask what evidence supports it.
2. Never choose an opportunity for the group. Never rank ideas as "best".
3. Never write the student's answers for them.
4. Never fabricate market statistics, prices, or "facts" about Ghana, campus, or customers.
5. If the record does not contain evidence, say so: "You have not established that yet."
6. Distinguish assumptions from evidence. If a sentence reads like "everyone wants this", press on it.
7. When a group is selecting, ask about the alternatives they are rejecting and why.
8. When evidence is logged, challenge mis-classification. Do not silently rewrite the student's claim.
9. Keep replies short: 2–4 sentences. This is a conversation, not an essay.
10. Stay respectful. A challenge should feel like a serious question, not a rejection.
11. Suggest a next investigation the students could actually do on campus, in a hostel, or in a nearby market — as a question, not a task list.
12. You may say "That is currently an assumption. What could you do to test it?"
13. Only discuss the material in CONTEXT. If a student asks about teammates' ideas that are not in CONTEXT, say they stay private until the group opens selection.
14. When a student is designing a test, push for a success line decided in advance and for the cheapest test that could prove them wrong.

Return ONLY a JSON object with this shape:
{
  "message": "string, the student-facing challenge",
  "challenge_type": "evidence" | "alternatives" | "customer" | "assumption" | "significance" | "reasoning" | "classification",
  "requires_evidence": true or false,
  "related_assumption_id": string or null,
  "suggested_next_action": "a short investigation the student could run"
}`;

function parseAdvisor(raw: string): { message: string; metadata: AdvisorMetadata } {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(trimmed.slice(start, end + 1)) as {
        message?: string;
        challenge_type?: string;
        requires_evidence?: boolean;
        related_assumption_id?: string | null;
        suggested_next_action?: string;
      };
      if (obj.message) {
        return {
          message: obj.message,
          metadata: {
            challengeType: obj.challenge_type,
            requiresEvidence: Boolean(obj.requires_evidence),
            relatedAssumptionId: obj.related_assumption_id ?? null,
            suggestedNextAction: obj.suggested_next_action,
          },
        };
      }
    } catch {
      /* fall through */
    }
  }
  return { message: trimmed, metadata: {} };
}

async function assembleContext(groupId: string, stage: AdvisorStage, studentId: string): Promise<string> {
  const sql = await getSql();
  const group = await sql<{ status: string; group_name: string }>`
    select status, group_name from groups where id = ${groupId} limit 1
  `;
  // Peers' ideas reach the advisor only once the group can see them. Before that the
  // advisor sees the student's own idea only — otherwise a student could simply ask it
  // what their teammates submitted.
  const peersVisible = canViewPeerOpportunities((group[0]?.status ?? "forming") as GroupStatus);
  const opps = await withRlsBypass(
    () => sql<{
      problem: string;
      status: string;
      author: string;
      observed_evidence: string;
      current_alternatives: string;
      potential_customer: string;
      uncertainties: string;
    }>`
      select o.problem, o.status, split_part(s.full_name, ' ', 1) as author, o.observed_evidence,
             o.current_alternatives, o.potential_customer, o.uncertainties
      from opportunities o
      join students s on s.id = o.student_id
      where o.group_id = ${groupId}
        and ((${peersVisible} and o.status <> 'draft') or o.student_id = ${studentId})
    `,
  );
  const venture = await sql<{ name: string; selection_rationale: string; opportunity_id: string }>`
    select name, selection_rationale, opportunity_id from ventures where group_id = ${groupId} limit 1
  `;
  const evidence = venture[0]
    ? await sql<{ title: string; classification: string; content: string }>`
        select e.title, e.classification, left(e.content, 280) as content
        from evidence_items e
        join ventures v on v.id = e.venture_id
        where v.group_id = ${groupId}
        order by e.created_at desc
        limit 8
      `
    : [];
  const assumptions = venture[0]
    ? await sql<{ statement: string; importance: string; confidence: string }>`
        select a.statement, a.importance, a.confidence
        from assumptions a
        join ventures v on v.id = a.venture_id
        where v.group_id = ${groupId}
        order by a.created_at desc
        limit 8
      `
    : [];
  const prefs = peersVisible
    ? await sql<{ author: string; rationale: string; problem: string }>`
        select split_part(s.full_name, ' ', 1) as author, p.rationale, o.problem
        from opportunity_preferences p
        join students s on s.id = p.student_id
        join opportunities o on o.id = p.opportunity_id
        where o.group_id = ${groupId} and p.student_id = ${studentId}
        limit 1
      `
    : [];
  const tests = venture[0]
    ? await sql<{ hypothesis: string; status: string; result: string | null; learning: string | null }>`
        select x.hypothesis, x.status, x.result, x.learning from experiments x
        join ventures v on v.id = x.venture_id where v.group_id = ${groupId}
        order by x.created_at desc limit 6
      `
    : [];

  return [
    `COURSE RULES: Students must back claims with evidence. The platform does not pick winners.`,
    `STAGE: ${stage}. Group status: ${group[0]?.status ?? "unknown"}. Group: ${group[0]?.group_name ?? ""}.`,
    opps.length
      ? `OPPORTUNITIES:\n${opps
          .map(
            (o) =>
              `- [${o.status}] ${o.author}: ${o.problem}\n  evidence: ${o.observed_evidence}\n  alternatives: ${o.current_alternatives}\n  customer: ${o.potential_customer}\n  unknowns: ${o.uncertainties}`,
          )
          .join("\n")}`
      : "OPPORTUNITIES: none submitted.",
    prefs.length
      ? `THIS STUDENT'S PREFERENCE: prefers “${prefs[0].problem}” because: ${prefs[0].rationale}`
      : "THIS STUDENT'S PREFERENCE: not recorded or not shared yet.",
    venture[0]
      ? `VENTURE: ${venture[0].name}\nSELECTION RATIONALE: ${venture[0].selection_rationale}`
      : "VENTURE: not created.",
    evidence.length
      ? `EVIDENCE:\n${evidence.map((e) => `- (${e.classification}) ${e.title}: ${e.content}`).join("\n")}`
      : "EVIDENCE: none.",
    assumptions.length
      ? `ASSUMPTIONS:\n${assumptions.map((a) => `- [${a.importance}/${a.confidence}] ${a.statement}`).join("\n")}`
      : "ASSUMPTIONS: none.",
    tests.length
      ? `TESTS:\n${tests.map((t) => `- [${t.status}${t.result ? `: ${t.result}` : ""}] ${t.hypothesis}${t.learning ? ` → learned: ${t.learning}` : ""}`).join("\n")}`
      : "TESTS: none yet.",
  ].join("\n\n");
}

export const sendAdvisorMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { stage: AdvisorStage; content: string; sessionId?: string }) => input)
  .handler(async ({ context, data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new AppError("AI_UNAVAILABLE", "The AI advisor is not available in this environment.");
    }
    if (!VALID.stage.has(data.stage)) throw new AppError("INVALID", "Unknown advisor stage.");
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const content = data.content.trim().slice(0, 1500);
    if (!content) throw new AppError("INVALID", "Write something to the advisor.");

    const sql = await getSql();
    // Each student gets a daily allowance (course setting) so one person can't run up the AI bill.
    const offering = await loadOfferingForStudent(student.id);
    const [used] = await sql<{ n: number }>`
      select count(*)::int as n from ai_advisor_messages
      where student_id = ${student.id} and role = 'student' and created_at > now() - interval '1 day'
    `;
    const allowance = advisorAllowance(Number(used?.n ?? 0), offering?.aiMessagesPerDay ?? 40);
    if (!allowance.allowed) {
      throw new AppError("LIMIT", "You've used today's advisor questions. Keep investigating — it resets in 24 hours.");
    }
    let sessionId = data.sessionId;
    if (sessionId) {
      const found = await sql<{ id: string; group_id: string; stage: string }>`
        select id, group_id, stage from ai_advisor_sessions where id = ${sessionId} limit 1
      `;
      if (!found[0] || found[0].group_id !== group.id || found[0].stage !== data.stage) {
        throw new AppError("NOT_FOUND", "That conversation does not belong to your group.");
      }
    } else {
      // 'idea' conversations are private to the student; later stages are shared with the group.
      const privateSession = data.stage === "idea";
      const existing = await sql<{ id: string }>`
        select id from ai_advisor_sessions
        where group_id = ${group.id} and stage = ${data.stage}
          and ((${privateSession} and student_id = ${student.id}) or (not ${privateSession} and student_id is null))
        order by created_at desc limit 1
      `;
      sessionId = existing[0]?.id;
      if (!sessionId) {
        sessionId = newId();
        const venture = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
        await sql`
          insert into ai_advisor_sessions (id, venture_id, group_id, stage, student_id)
          values (${sessionId}, ${venture[0]?.id ?? null}, ${group.id}, ${data.stage}, ${privateSession ? student.id : null})
        `;
        await logEvent({
          studentId: student.id,
          groupId: group.id,
          ventureId: venture[0]?.id ?? null,
          eventType: "AI_SESSION_STARTED",
          entityType: "ai_advisor_session",
          entityId: sessionId,
        });
      }
    }

    const userMsgId = newId();
    const venture = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
    await sql`
      insert into ai_advisor_messages (id, session_id, venture_id, group_id, student_id, role, content, metadata)
      values (${userMsgId}, ${sessionId}, ${venture[0]?.id ?? null}, ${group.id}, ${student.id}, 'student', ${content}, null)
    `;

    const history = await sql<{ role: string; content: string }>`
      select role, content from ai_advisor_messages
      where session_id = ${sessionId}
      order by created_at asc
    `;
    const brief = await assembleContext(group.id, data.stage, student.id);
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: `CONTEXT FOR THIS TURN:\n${brief}` },
      ...history.slice(-12).map((m) => ({
        role: m.role === "advisor" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      signal: AbortSignal.timeout(30_000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        messages,
        max_tokens: 400,
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      throw new AppError("AI_ERROR", `The advisor could not respond (${res.status}). Try again.`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseAdvisor(raw);
    const advisorMsgId = newId();
    await sql`
      insert into ai_advisor_messages (id, session_id, venture_id, group_id, student_id, role, content, metadata)
      values (
        ${advisorMsgId}, ${sessionId}, ${venture[0]?.id ?? null}, ${group.id}, ${student.id},
        'advisor', ${parsed.message}, ${JSON.stringify(parsed.metadata)}
      )
    `;
    return {
      sessionId,
      message: parsed.message,
      metadata: parsed.metadata,
      leftToday: allowance.left - 1,
    };
  });
