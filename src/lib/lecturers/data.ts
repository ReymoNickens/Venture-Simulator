// What a lecturer reads. Every query runs as the signed-in lecturer, so the
// row-level security from 0007/0008/0011 limits it to the classes they hold
// role_lecturer for; the WHERE clauses here only narrow further (one class,
// one group). Drafts stay private, as for students.
import { AppError } from "../server/errors.ts";
import type { Db } from "../classes/service.ts";
import type { GroupSignals } from "./insights.ts";

export interface LecturerClass {
  offeringId: string;
  courseCode: string;
  programme: string | null;
  level: string | null;
  semester: string;
  academicYear: string;
  students: number;
  groups: number;
}

export async function myClasses(db: Db): Promise<LecturerClass[]> {
  const rows = await db.query<{
    id: string;
    course_code: string;
    programme: string | null;
    level: string | null;
    semester: string;
    academic_year: string;
    students: number | string;
    groups: number | string;
  }>(
    `select o.id, c.course_code, o.programme, o.level, o.semester, o.academic_year,
            (select count(*) from course_enrolments e join students s on s.id = e.student_id
              where e.course_offering_id = o.id and not s.is_synthetic) as students,
            (select count(*) from groups g where g.course_offering_id = o.id) as groups
     from course_offerings o join courses c on c.id = o.course_id
     where app_is_lecturer_for_offering(o.id)
     order by c.course_code, o.programme nulls first, o.level`,
  );
  return rows.map((r) => ({
    offeringId: r.id,
    courseCode: r.course_code,
    programme: r.programme,
    level: r.level,
    semester: r.semester,
    academicYear: r.academic_year,
    students: Number(r.students),
    groups: Number(r.groups),
  }));
}

export function classLabel(c: Pick<LecturerClass, "courseCode" | "programme" | "level">): string {
  return [c.courseCode, c.programme ?? "All programmes", c.level].filter(Boolean).join(" · ");
}

const n = (v: unknown) => Number(v ?? 0);

/** The numbers the attention rules need, for every group the lecturer can see. */
export async function groupSignals(db: Db, offeringId?: string): Promise<GroupSignals[]> {
  const groups = await db.query<{
    id: string;
    group_name: string;
    group_number: number;
    course_offering_id: string;
    status: string;
    venture_name: string | null;
    venture_id: string | null;
  }>(
    `select g.id, g.group_name, g.group_number, g.course_offering_id, g.status, v.name as venture_name, v.id as venture_id
     from groups g left join ventures v on v.group_id = g.id
     where ($1::text is null or g.course_offering_id = $1)
     order by g.course_offering_id, g.group_number`,
    [offeringId ?? null],
  );
  if (!groups.length) return [];
  const ids = groups.map((g) => g.id);

  const [members, submitted, evidence, assumptions, sims, last, feedback] = await Promise.all([
    db.query<{ group_id: string; id: string; full_name: string; is_synthetic: boolean | string; events: number | string }>(
      `select gm.group_id, s.id, s.full_name, s.is_synthetic,
              (select count(*) from activity_events a where a.student_id = s.id and a.group_id = gm.group_id) as events
       from group_members gm join students s on s.id = gm.student_id
       where gm.membership_status = 'active' and gm.group_id = any($1)
       order by lower(s.full_name)`,
      [ids],
    ),
    db.query<{ group_id: string; n: number | string }>(
      `select group_id, count(*) as n from opportunities where status <> 'draft' and group_id = any($1) group by group_id`,
      [ids],
    ),
    db.query<{ group_id: string; total: number | string; weak: number | string }>(
      `select v.group_id, count(*) as total,
              count(*) filter (where e.classification in ('opinion', 'assumption', 'unknown')) as weak
       from evidence_items e join ventures v on v.id = e.venture_id
       where v.group_id = any($1) group by v.group_id`,
      [ids],
    ),
    db.query<{ group_id: string; total: number | string; untested: number | string }>(
      `select v.group_id, count(*) as total,
              count(*) filter (where a.importance = 'critical'
                and not exists (select 1 from assumption_evidence l where l.assumption_id = a.id)) as untested
       from assumptions a join ventures v on v.id = a.venture_id
       where v.group_id = any($1) group by v.group_id`,
      [ids],
    ),
    db.query<{ group_id: string; status: string; completed_period: number; period_count: number; cash: number | string | null }>(
      `select s.group_id, s.status, s.completed_period, c.period_count,
              (select r.closing_cash from simulation_results r where r.simulation_id = s.id order by r.period desc limit 1) as cash
       from simulations s join simulation_cohorts c on c.id = s.cohort_id
       where s.group_id = any($1)`,
      [ids],
    ),
    db.query<{ group_id: string; at: unknown }>(
      `select group_id, max(created_at) as at from activity_events where group_id = any($1) group by group_id`,
      [ids],
    ),
    db.query<{ group_id: string; n: number | string }>(
      `select group_id, count(*) as n from group_feedback where group_id = any($1) group by group_id`,
      [ids],
    ),
  ]);

  const by = <T extends { group_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.group_id, r]));
  const sub = by(submitted);
  const ev = by(evidence);
  const as = by(assumptions);
  const sim = by(sims);
  const lastAt = by(last);
  const fb = by(feedback);

  return groups.map((g) => {
    const m = members.filter((x) => x.group_id === g.id);
    const s = sim.get(g.id);
    const at = lastAt.get(g.id)?.at;
    return {
      groupId: g.id,
      groupName: g.group_name,
      groupNumber: Number(g.group_number),
      offeringId: g.course_offering_id,
      status: g.status,
      ventureName: g.venture_name,
      members: m.map((x) => ({
        studentId: x.id,
        fullName: x.full_name,
        events: n(x.events),
        synthetic: x.is_synthetic === true || x.is_synthetic === "t",
      })),
      submitted: n(sub.get(g.id)?.n),
      required: m.length,
      evidenceTotal: n(ev.get(g.id)?.total),
      evidenceWeak: n(ev.get(g.id)?.weak),
      assumptionsTotal: n(as.get(g.id)?.total),
      criticalUntested: n(as.get(g.id)?.untested),
      sim: s
        ? { status: s.status, completedPeriod: Number(s.completed_period), periodCount: Number(s.period_count), cash: n(s.cash) }
        : null,
      lastActivityAt: at ? new Date(String(at)).toISOString() : null,
      feedbackCount: n(fb.get(g.id)?.n),
    };
  });
}

export interface ActivityItem {
  id: string;
  at: string;
  eventType: string;
  studentName: string | null;
  groupId: string | null;
  groupName: string | null;
  offeringId: string | null;
}

export async function activityFeed(db: Db, opts: { offeringId?: string; groupId?: string; limit?: number } = {}): Promise<ActivityItem[]> {
  const rows = await db.query<{
    id: string;
    created_at: unknown;
    event_type: string;
    full_name: string | null;
    group_id: string | null;
    group_name: string | null;
    course_offering_id: string | null;
  }>(
    `select a.id, a.created_at, a.event_type, s.full_name, g.id as group_id, g.group_name, g.course_offering_id
     from activity_events a
     join groups g on g.id = a.group_id
     left join students s on s.id = a.student_id
     where ($1::text is null or g.course_offering_id = $1)
       and ($2::text is null or g.id = $2)
       and a.event_type not in ('PROFILE_CREATED', 'PROFILE_UPDATED')
     order by a.created_at desc
     limit $3`,
    [opts.offeringId ?? null, opts.groupId ?? null, Math.min(opts.limit ?? 80, 300)],
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(String(r.created_at)).toISOString(),
    eventType: r.event_type,
    studentName: r.full_name,
    groupId: r.group_id,
    groupName: r.group_name,
    offeringId: r.course_offering_id,
  }));
}

export interface GroupDetail {
  groupId: string;
  groupName: string;
  groupNumber: number;
  offeringId: string;
  status: string;
  venture: { name: string; rationale: string; problem: string | null; author: string | null } | null;
  members: {
    studentId: string;
    fullName: string;
    indexNumber: string;
    isSynthetic: boolean;
    submitted: boolean;
    events: number;
    evidence: number;
    assumptions: number;
    advisorQuestions: number;
  }[];
  opportunities: { id: string; author: string; problem: string; status: string }[];
  preferences: { studentName: string; problem: string; rationale: string }[];
  evidence: { id: string; title: string; content: string; classification: string; sourceType: string; author: string; at: string }[];
  assumptions: { id: string; statement: string; importance: string; confidence: string; supports: number; challenges: number }[];
  weeks: { period: number; revenue: number; profit: number; closingCash: number; status: string }[];
  sim: { status: string; completedPeriod: number; periodCount: number } | null;
  feedback: { id: string; author: string; body: string; at: string }[];
}

export async function groupDetail(db: Db, groupId: string): Promise<GroupDetail> {
  const g = (
    await db.query<{ id: string; group_name: string; group_number: number; course_offering_id: string; status: string }>(
      `select id, group_name, group_number, course_offering_id, status from groups where id = $1`,
      [groupId],
    )
  )[0];
  // Invisible under RLS means "not in your classes": say not found, not forbidden.
  if (!g) throw new AppError("NOT_FOUND", "That group is not in your classes.");

  const [venture, members, opps, prefs, evidence, assumptions, weeks, sim, feedback] = await Promise.all([
    db.query<{ name: string; selection_rationale: string; problem: string | null; author: string | null }>(
      `select v.name, v.selection_rationale, o.problem, s.full_name as author
       from ventures v left join opportunities o on o.id = v.opportunity_id left join students s on s.id = o.student_id
       where v.group_id = $1`,
      [groupId],
    ),
    db.query<{
      id: string;
      full_name: string;
      index_number: string;
      is_synthetic: boolean | string;
      submitted: boolean | string;
      events: number | string;
      evidence: number | string;
      assumptions: number | string;
      questions: number | string;
    }>(
      `select s.id, s.full_name, s.index_number, s.is_synthetic,
              exists (select 1 from opportunities o where o.student_id = s.id and o.group_id = gm.group_id and o.status <> 'draft') as submitted,
              (select count(*) from activity_events a where a.student_id = s.id and a.group_id = gm.group_id) as events,
              (select count(*) from evidence_items e join ventures v on v.id = e.venture_id where e.student_id = s.id and v.group_id = gm.group_id) as evidence,
              (select count(*) from assumptions x join ventures v on v.id = x.venture_id where x.student_id = s.id and v.group_id = gm.group_id) as assumptions,
              (select count(*) from ai_advisor_messages m where m.student_id = s.id and m.group_id = gm.group_id and m.role = 'student') as questions
       from group_members gm join students s on s.id = gm.student_id
       where gm.group_id = $1 and gm.membership_status = 'active'
       order by s.is_synthetic, lower(s.full_name)`,
      [groupId],
    ),
    db.query<{ id: string; author: string; problem: string; status: string }>(
      `select o.id, s.full_name as author, o.problem, o.status
       from opportunities o join students s on s.id = o.student_id
       where o.group_id = $1 and o.status <> 'draft' order by (o.status = 'selected') desc, o.created_at`,
      [groupId],
    ),
    db.query<{ student_name: string; problem: string; rationale: string }>(
      `select s.full_name as student_name, o.problem, p.rationale
       from opportunity_preferences p join opportunities o on o.id = p.opportunity_id join students s on s.id = p.student_id
       where o.group_id = $1 order by p.created_at`,
      [groupId],
    ),
    db.query<{ id: string; title: string; content: string; classification: string; source_type: string; author: string; created_at: unknown }>(
      `select e.id, e.title, e.content, e.classification, e.source_type, s.full_name as author, e.created_at
       from evidence_items e join ventures v on v.id = e.venture_id join students s on s.id = e.student_id
       where v.group_id = $1 order by e.created_at desc`,
      [groupId],
    ),
    db.query<{ id: string; statement: string; importance: string; confidence: string; supports: number | string; challenges: number | string }>(
      `select a.id, a.statement, a.importance, a.confidence,
              (select count(*) from assumption_evidence l where l.assumption_id = a.id and l.relationship_type = 'supports') as supports,
              (select count(*) from assumption_evidence l where l.assumption_id = a.id and l.relationship_type = 'challenges') as challenges
       from assumptions a join ventures v on v.id = a.venture_id
       where v.group_id = $1 order by (a.importance = 'critical') desc, a.created_at`,
      [groupId],
    ),
    db.query<{ period: number; revenue: number | string | null; profit: number | string | null; closing_cash: number | string; status: string }>(
      `select r.period, r.student_output->'outcomes'->>'revenue' as revenue, r.student_output->'outcomes'->>'profit' as profit,
              r.closing_cash, r.status
       from simulation_results r join simulations s on s.id = r.simulation_id
       where s.group_id = $1 order by r.period`,
      [groupId],
    ),
    db.query<{ status: string; completed_period: number; period_count: number }>(
      `select s.status, s.completed_period, c.period_count
       from simulations s join simulation_cohorts c on c.id = s.cohort_id where s.group_id = $1`,
      [groupId],
    ),
    db.query<{ id: string; author_name: string; body: string; created_at: unknown }>(
      `select id, author_name, body, created_at from group_feedback where group_id = $1 order by created_at desc`,
      [groupId],
    ),
  ]);

  const v = venture[0];
  const s = sim[0];
  const truthy = (x: boolean | string) => x === true || x === "t";
  return {
    groupId: g.id,
    groupName: g.group_name,
    groupNumber: Number(g.group_number),
    offeringId: g.course_offering_id,
    status: g.status,
    venture: v ? { name: v.name, rationale: v.selection_rationale, problem: v.problem, author: v.author } : null,
    members: members.map((m) => ({
      studentId: m.id,
      fullName: m.full_name,
      indexNumber: m.index_number,
      isSynthetic: truthy(m.is_synthetic),
      submitted: truthy(m.submitted),
      events: n(m.events),
      evidence: n(m.evidence),
      assumptions: n(m.assumptions),
      advisorQuestions: n(m.questions),
    })),
    opportunities: opps,
    preferences: prefs.map((p) => ({ studentName: p.student_name, problem: p.problem, rationale: p.rationale })),
    evidence: evidence.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      classification: e.classification,
      sourceType: e.source_type,
      author: e.author,
      at: new Date(String(e.created_at)).toISOString(),
    })),
    assumptions: assumptions.map((a) => ({
      id: a.id,
      statement: a.statement,
      importance: a.importance,
      confidence: a.confidence,
      supports: n(a.supports),
      challenges: n(a.challenges),
    })),
    weeks: weeks.map((w) => ({
      period: Number(w.period),
      revenue: n(w.revenue),
      profit: n(w.profit),
      closingCash: n(w.closing_cash),
      status: w.status,
    })),
    sim: s ? { status: s.status, completedPeriod: Number(s.completed_period), periodCount: Number(s.period_count) } : null,
    feedback: feedback.map((f) => ({ id: f.id, author: f.author_name, body: f.body, at: new Date(String(f.created_at)).toISOString() })),
  };
}

export async function addFeedback(
  db: Db,
  input: { groupId: string; authorUserId: string; authorName: string; body: string },
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new AppError("INVALID", "Write something first.");
  if (body.length > 1000) throw new AppError("INVALID", "Keep feedback under 1000 characters.");
  const visible = await db.query(`select 1 from groups where id = $1`, [input.groupId]);
  if (!visible.length) throw new AppError("NOT_FOUND", "That group is not in your classes.");
  await db.query(
    `insert into group_feedback (id, group_id, author_user_id, author_name, body) values ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), input.groupId, input.authorUserId, input.authorName, body],
  );
}

export interface MarksRow {
  fullName: string;
  indexNumber: string;
  email: string;
  activated: boolean;
  group: string;
  problemSubmitted: boolean;
  pickRecorded: boolean;
  evidence: number;
  assumptions: number;
  advisorQuestions: number;
  simWeeksSubmitted: number;
  activity: number;
  lastActive: string;
}

/** One row per student on a class list, as a starting point for marking. */
export async function marksRows(db: Db, offeringId: string): Promise<MarksRow[]> {
  const rows = await db.query<{
    full_name: string;
    index_number: string;
    email: string | null;
    auth_user_id: string | null;
    group_name: string | null;
    submitted: boolean | string;
    picked: boolean | string;
    evidence: number | string;
    assumptions: number | string;
    questions: number | string;
    sim_weeks: number | string;
    activity: number | string;
    last_active: unknown;
  }>(
    `select s.full_name, s.index_number, s.email, s.auth_user_id, g.group_name,
            exists (select 1 from opportunities o where o.student_id = s.id and o.status <> 'draft') as submitted,
            exists (select 1 from opportunity_preferences p where p.student_id = s.id) as picked,
            (select count(*) from evidence_items e where e.student_id = s.id) as evidence,
            (select count(*) from assumptions a where a.student_id = s.id) as assumptions,
            (select count(*) from ai_advisor_messages m where m.student_id = s.id and m.role = 'student') as questions,
            (select count(*) from simulation_decisions d where d.submitted_by_student_id = s.id) as sim_weeks,
            (select count(*) from activity_events a where a.student_id = s.id and a.group_id is not null) as activity,
            (select max(a.created_at) from activity_events a where a.student_id = s.id and a.group_id is not null) as last_active
     from course_enrolments e
     join students s on s.id = e.student_id
     left join group_members gm on gm.student_id = s.id and gm.membership_status = 'active'
       and gm.group_id in (select id from groups where course_offering_id = $1)
     left join groups g on g.id = gm.group_id
     where e.course_offering_id = $1 and e.status = 'active' and not s.is_synthetic
     order by lower(s.full_name)`,
    [offeringId],
  );
  const t = (x: boolean | string) => x === true || x === "t";
  return rows.map((r) => ({
    fullName: r.full_name,
    indexNumber: r.index_number,
    email: r.email ?? "",
    activated: Boolean(r.auth_user_id),
    group: r.group_name ?? "",
    problemSubmitted: t(r.submitted),
    pickRecorded: t(r.picked),
    evidence: n(r.evidence),
    assumptions: n(r.assumptions),
    advisorQuestions: n(r.questions),
    simWeeksSubmitted: n(r.sim_weeks),
    activity: n(r.activity),
    lastActive: r.last_active ? new Date(String(r.last_active)).toISOString().slice(0, 10) : "",
  }));
}
