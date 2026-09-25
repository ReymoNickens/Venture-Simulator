import { getSql } from "@/lib/db";
import { decisionThreshold } from "@/lib/domain/state-machine";
import type {
  CanvasEntry,
  CourseLife,
  FeasibilityAssessment,
  Interview,
  MarketEvent,
  PlanSection,
  Prototype,
  PrototypeTest,
  VentureDecision,
  VentureWork,
} from "@/lib/domain/types";

// Server-only loaders for the workspace snapshot's later-stage sections.
// Imported only inside getWorkspace's handler.

const str = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function emptyWork(): VentureWork {
  return {
    interviews: [],
    canvas: [],
    feasibility: [],
    finance: null,
    prototypes: [],
    prototypeTests: [],
    decisions: [],
    plan: [],
  };
}

export async function loadVentureWork(
  ventureId: string,
  activeMembers: number,
  quorumPct: number,
): Promise<VentureWork> {
  const sql = await getSql();

  const interviewRows = await sql<Record<string, unknown>>`
    select i.*, s.full_name as author_name
    from interviews i join students s on s.id = i.student_id
    where i.venture_id = ${ventureId}
    order by i.created_at desc
  `;
  const interviews: Interview[] = interviewRows.map((r) => ({
    id: str(r.id),
    studentId: str(r.student_id),
    authorName: str(r.author_name),
    evidenceItemId: r.evidence_item_id ? str(r.evidence_item_id) : null,
    intervieweeProfile: str(r.interviewee_profile),
    segment: str(r.segment),
    location: str(r.location),
    conductedOn: r.conducted_on ? str(r.conducted_on) : null,
    channel: str(r.channel),
    consent: r.consent === true || r.consent === "t",
    keyQuotes: str(r.key_quotes),
    pains: str(r.pains),
    currentSolution: str(r.current_solution),
    spendSignal: str(r.spend_signal),
    wouldPay: str(r.would_pay) as Interview["wouldPay"],
    painLevel: r.pain_level === null || r.pain_level === undefined ? null : Number(r.pain_level),
    surprise: str(r.surprise),
    createdAt: str(r.created_at),
    syncState: "synced",
  }));

  const canvasRows = await sql<Record<string, unknown>>`
    select c.*, s.full_name as author_name
    from canvas_entries c join students s on s.id = c.student_id
    where c.venture_id = ${ventureId}
    order by c.created_at asc
  `;
  const canvasLinks = canvasRows.length
    ? await sql<{ entry_id: string; evidence_item_id: string }>`
        select l.entry_id, l.evidence_item_id
        from canvas_entry_evidence l join canvas_entries c on c.id = l.entry_id
        where c.venture_id = ${ventureId}
      `
    : [];
  const canvas: CanvasEntry[] = canvasRows.map((r) => ({
    id: str(r.id),
    block: str(r.block),
    body: str(r.body),
    studentId: str(r.student_id),
    authorName: str(r.author_name),
    status: str(r.status) as CanvasEntry["status"],
    retiredReason: r.retired_reason ? str(r.retired_reason) : null,
    evidenceIds: canvasLinks.filter((l) => l.entry_id === r.id).map((l) => l.evidence_item_id),
    createdAt: str(r.created_at),
  }));

  const feasRows = await sql<Record<string, unknown>>`
    select f.*, s.full_name as author_name
    from feasibility_assessments f join students s on s.id = f.student_id
    where f.venture_id = ${ventureId}
    order by f.created_at desc
  `;
  const latestByLens = new Map<string, FeasibilityAssessment>();
  const lensCounts = new Map<string, number>();
  for (const r of feasRows) {
    const lens = str(r.lens);
    lensCounts.set(lens, (lensCounts.get(lens) ?? 0) + 1);
    if (!latestByLens.has(lens)) {
      latestByLens.set(lens, {
        id: str(r.id),
        lens,
        verdict: str(r.verdict) as FeasibilityAssessment["verdict"],
        reasoning: str(r.reasoning),
        evidenceIds: parseIds(r.evidence_ids as string | null),
        authorName: str(r.author_name),
        createdAt: str(r.created_at),
        revisions: 0,
      });
    }
  }
  const feasibility = [...latestByLens.values()].map((f) => ({
    ...f,
    revisions: (lensCounts.get(f.lens) ?? 1) - 1,
  }));

  const financeRows = await sql<Record<string, unknown>>`
    select f.id, f.inputs, f.note, f.created_at, s.full_name as author_name,
           (select count(*)::int from financial_models x where x.venture_id = ${ventureId}) as versions
    from financial_models f join students s on s.id = f.student_id
    where f.venture_id = ${ventureId}
    order by f.created_at desc
    limit 1
  `;
  const finance = financeRows[0]
    ? {
        id: str(financeRows[0].id),
        inputs: str(financeRows[0].inputs),
        note: str(financeRows[0].note),
        authorName: str(financeRows[0].author_name),
        createdAt: str(financeRows[0].created_at),
        versions: Number(financeRows[0].versions ?? 1),
      }
    : null;

  const protoRows = await sql<Record<string, unknown>>`
    select p.id, p.title, p.kind, p.description, p.learning_goal, p.cost_ghs,
           (p.photo_data is not null) as has_photo, p.created_at, s.full_name as author_name
    from prototypes p join students s on s.id = p.student_id
    where p.venture_id = ${ventureId}
    order by p.created_at desc
  `;
  const prototypes: Prototype[] = protoRows.map((r) => ({
    id: str(r.id),
    title: str(r.title),
    kind: str(r.kind),
    description: str(r.description),
    learningGoal: str(r.learning_goal),
    costGhs: Number(r.cost_ghs ?? 0),
    hasPhoto: r.has_photo === true || r.has_photo === "t",
    authorName: str(r.author_name),
    createdAt: str(r.created_at),
  }));

  const testRows = await sql<Record<string, unknown>>`
    select t.*, s.full_name as author_name
    from prototype_tests t join students s on s.id = t.student_id
    where t.venture_id = ${ventureId}
    order by t.created_at desc
  `;
  const prototypeTests: PrototypeTest[] = testRows.map((r) => ({
    id: str(r.id),
    prototypeId: str(r.prototype_id),
    evidenceItemId: r.evidence_item_id ? str(r.evidence_item_id) : null,
    testerProfile: str(r.tester_profile),
    task: str(r.task),
    observed: str(r.observed),
    quote: str(r.quote),
    outcome: str(r.outcome) as PrototypeTest["outcome"],
    wouldPay: str(r.would_pay) as PrototypeTest["wouldPay"],
    authorName: str(r.author_name),
    createdAt: str(r.created_at),
    syncState: "synced",
  }));

  const decisionRows = await sql<Record<string, unknown>>`
    select d.*, s.full_name as proposer_name
    from venture_decisions d join students s on s.id = d.proposed_by_student_id
    where d.venture_id = ${ventureId}
    order by d.created_at desc
  `;
  const decisionVotes = decisionRows.length
    ? await sql<Record<string, unknown>>`
        select v.decision_id, v.student_id, s.full_name as student_name, v.vote, v.comment, v.created_at
        from decision_votes v
        join students s on s.id = v.student_id
        join venture_decisions d on d.id = v.decision_id
        where d.venture_id = ${ventureId}
        order by v.created_at asc
      `
    : [];
  const decisions: VentureDecision[] = decisionRows.map((r) => ({
    id: str(r.id),
    decision: str(r.decision) as VentureDecision["decision"],
    rationale: str(r.rationale),
    whatChanges: str(r.what_changes),
    status: str(r.status) as VentureDecision["status"],
    proposedByStudentId: str(r.proposed_by_student_id),
    proposedByName: str(r.proposer_name),
    createdAt: str(r.created_at),
    threshold: decisionThreshold(activeMembers, quorumPct),
    votes: decisionVotes
      .filter((v) => v.decision_id === r.id)
      .map((v) => ({
        studentId: str(v.student_id),
        studentName: str(v.student_name),
        vote: str(v.vote) as "endorse" | "object",
        comment: str(v.comment),
        createdAt: str(v.created_at),
      })),
  }));

  const planRows = await sql<Record<string, unknown>>`
    select p.section, p.body, p.created_at, s.full_name as author_name
    from plan_sections p join students s on s.id = p.student_id
    where p.venture_id = ${ventureId}
    order by p.created_at desc
  `;
  const planLatest = new Map<string, PlanSection>();
  const planCounts = new Map<string, number>();
  for (const r of planRows) {
    const section = str(r.section);
    planCounts.set(section, (planCounts.get(section) ?? 0) + 1);
    if (!planLatest.has(section)) {
      planLatest.set(section, {
        section,
        body: str(r.body),
        authorName: str(r.author_name),
        createdAt: str(r.created_at),
        revisions: 0,
      });
    }
  }
  const plan = [...planLatest.values()].map((p) => ({
    ...p,
    revisions: (planCounts.get(p.section) ?? 1) - 1,
  }));

  return { interviews, canvas, feasibility, finance, prototypes, prototypeTests, decisions, plan };
}

export async function loadCourseLife(input: {
  studentId: string;
  groupId: string | null;
  offeringId: string | null;
}): Promise<CourseLife> {
  const sql = await getSql();
  const empty: CourseLife = {
    myReflections: [],
    myPeerRatings: [],
    milestones: [],
    announcements: [],
    marketEvents: [],
    feedback: [],
    interviewsPerMember: 2,
    minPrototypeTests: 5,
  };
  if (!input.offeringId) return empty;

  const config = await sql<{ interviews_per_member: number; min_prototype_tests: number }>`
    select interviews_per_member, min_prototype_tests from course_offerings where id = ${input.offeringId}
  `;
  const reflections = await sql<Record<string, unknown>>`
    select id, stage, body, created_at from reflections
    where student_id = ${input.studentId}
    order by created_at desc
  `;
  const ratings = input.groupId
    ? await sql<Record<string, unknown>>`
        select ratee_student_id, score, comment from peer_ratings
        where rater_student_id = ${input.studentId} and group_id = ${input.groupId}
      `
    : [];
  const milestones = await sql<Record<string, unknown>>`
    select stage, due_at, note from milestones
    where course_offering_id = ${input.offeringId}
    order by due_at asc
  `;
  const announcements = await sql<Record<string, unknown>>`
    select a.id, a.title, a.body, a.created_at, st.full_name as staff_name
    from announcements a join staff st on st.id = a.staff_id
    where a.course_offering_id = ${input.offeringId}
    order by a.created_at desc
    limit 10
  `;
  const eventRows = await sql<Record<string, unknown>>`
    select id, event_key, title, body, prompt, respond_by, created_at
    from market_events
    where course_offering_id = ${input.offeringId}
      and (group_id is null or group_id = ${input.groupId ?? ""})
    order by created_at desc
    limit 20
  `;
  const responseRows =
    eventRows.length && input.groupId
      ? await sql<Record<string, unknown>>`
          select r.event_id, r.student_id, r.body, r.created_at, s.full_name as student_name
          from event_responses r join students s on s.id = r.student_id
          where r.group_id = ${input.groupId}
          order by r.created_at asc
        `
      : [];
  const marketEvents: MarketEvent[] = eventRows.map((e) => {
    const responses = responseRows.filter((r) => r.event_id === e.id);
    const mine = responses.find((r) => r.student_id === input.studentId);
    return {
      id: str(e.id),
      eventKey: str(e.event_key),
      title: str(e.title),
      body: str(e.body),
      prompt: str(e.prompt),
      respondBy: e.respond_by ? str(e.respond_by) : null,
      createdAt: str(e.created_at),
      myResponse: mine ? str(mine.body) : null,
      groupResponses: responses.map((r) => ({
        studentName: str(r.student_name),
        body: str(r.body),
        createdAt: str(r.created_at),
      })),
    };
  });
  const feedback = input.groupId
    ? await sql<Record<string, unknown>>`
        select f.id, f.stage, f.body, f.level, f.created_at, st.full_name as staff_name
        from feedback f join staff st on st.id = f.staff_id
        where f.group_id = ${input.groupId}
        order by f.created_at desc
      `
    : [];

  return {
    myReflections: reflections.map((r) => ({
      id: str(r.id),
      stage: str(r.stage),
      body: str(r.body),
      createdAt: str(r.created_at),
    })),
    myPeerRatings: ratings.map((r) => ({
      rateeStudentId: str(r.ratee_student_id),
      score: Number(r.score),
      comment: str(r.comment),
    })),
    milestones: milestones.map((m) => ({ stage: str(m.stage), dueAt: str(m.due_at), note: str(m.note) })),
    announcements: announcements.map((a) => ({
      id: str(a.id),
      title: str(a.title),
      body: str(a.body),
      staffName: str(a.staff_name),
      createdAt: str(a.created_at),
    })),
    marketEvents,
    feedback: feedback.map((f) => ({
      id: str(f.id),
      stage: str(f.stage),
      body: str(f.body),
      level: f.level === null || f.level === undefined ? null : Number(f.level),
      staffName: str(f.staff_name),
      createdAt: str(f.created_at),
    })),
    interviewsPerMember: Number(config[0]?.interviews_per_member ?? 2),
    minPrototypeTests: Number(config[0]?.min_prototype_tests ?? 5),
  };
}
