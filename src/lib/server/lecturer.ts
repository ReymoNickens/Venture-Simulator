// The lecturer's side. A lecturer joins a course offering with its invite code and then
// sees only that offering's groups (enforced by the lecturer_read policies in 0006). They
// can read everything a group has produced, leave notes, and open selection early for a
// group whose missing members aren't coming. They cannot write students' work.
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { dbSource, getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { AppError, logEvent, refreshGroupStatus } from "./authz";

type Sql = Awaited<ReturnType<typeof getSql>>;
type Row = Record<string, string | number | boolean | null>;
const DAY = 86_400_000;
/** Local preview only (embedded PGLite, no real users): lets anyone try the lecturer view. */
const DEMO_CODE = "DEMO-LECTURER";

async function taughtOfferings(sql: Sql, userId: string) {
  return sql<{ id: string; course_code: string; course_name: string; semester: string; academic_year: string; decision_rule: string }>`
    select o.id, c.course_code, c.course_name, o.semester, o.academic_year, o.decision_rule
    from user_roles ur join app_roles r on r.id = ur.role_id
    join course_offerings o on o.id = ur.course_offering_id join courses c on c.id = o.course_id
    where ur.user_id = ${userId} and r.name = 'lecturer'
    order by o.academic_year desc
  `;
}

async function requireTeaches(sql: Sql, userId: string, groupId: string) {
  const rows = await sql<{ id: string; course_offering_id: string }>`
    select g.id, g.course_offering_id from groups g
    join user_roles ur on ur.course_offering_id = g.course_offering_id and ur.user_id = ${userId}
    join app_roles r on r.id = ur.role_id and r.name = 'lecturer'
    where g.id = ${groupId} limit 1
  `;
  if (!rows[0]) throw new AppError("FORBIDDEN", "You don't teach this group.");
  return rows[0];
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const offerings = await taughtOfferings(sql, context.userId);
    const student = await sql<{ id: string }>`select id from students where auth_user_id = ${context.userId} limit 1`;
    return { isLecturer: offerings.length > 0, isStudent: Boolean(student[0]), offerings, demoCodeAvailable: dbSource === "pglite" };
  });

export const claimLecturerRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string; code: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const [o] = await sql<{ id: string; lecturer_invite_code: string | null }>`
      select id, lecturer_invite_code from course_offerings where id = ${data.offeringId} limit 1
    `;
    if (!o) throw new AppError("NOT_FOUND", "That course offering doesn't exist.");
    const code = data.code.trim().toUpperCase();
    const ok = (o.lecturer_invite_code && code === o.lecturer_invite_code.toUpperCase()) || (dbSource === "pglite" && code === DEMO_CODE);
    if (!ok) throw new AppError("INVALID", "That lecturer code isn't right for this course. Ask the course administrator.");
    // Role grants are system writes (user_roles only accepts the student role from users).
    await withRlsBypass(() => sql`
      insert into user_roles (id, user_id, role_id, course_offering_id)
      values (${newId()}, ${context.userId}, 'role_lecturer', ${o.id})
      on conflict (user_id, role_id, course_offering_id) do nothing
    `);
    await withRlsBypass(() => logEvent({ eventType: "LECTURER_JOINED", entityType: "course_offering", entityId: o.id, metadata: { userId: context.userId } }));
    return { ok: true };
  });

export const getCohort = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { offeringId?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const offerings = await taughtOfferings(sql, context.userId);
    if (!offerings.length) throw new AppError("FORBIDDEN", "You're not a lecturer on any course yet.");
    const offering = offerings.find((o) => o.id === data.offeringId) ?? offerings[0];
    // Everything below is filtered by the lecturer_read policies to this offering.
    const groups = await sql<{ id: string; group_name: string; group_number: number; status: string; created_at: string; selection_opened_by: string | null; capacity: number }>`
      select id, group_name, group_number, status, created_at, selection_opened_by, capacity
      from groups where course_offering_id = ${offering.id} order by group_number
    `;
    const ids = groups.map((g) => g.id);
    if (!ids.length) return { offering, offerings, groups: [], totals: { students: 0, groups: 0, ventures: 0, evidence: 0, experiments: 0 } };
    const count = async (q: Promise<{ group_id: string; n: number }[]>) => new Map((await q).map((r) => [r.group_id, Number(r.n)]));
    const [members, submitted, voted, evidence, assumptions, testsDone, testsPlanned, aiMsgs, lastActive, synthetic] = await Promise.all([
      count(sql`select group_id, count(*)::int n from group_members where membership_status='active' and group_id = any(${ids}) group by group_id`),
      count(sql`select group_id, count(*)::int n from opportunities where status <> 'draft' and group_id = any(${ids}) group by group_id`),
      count(sql`select o.group_id, count(distinct p.student_id)::int n from opportunity_preferences p join opportunities o on o.id=p.opportunity_id where o.group_id = any(${ids}) group by o.group_id`),
      count(sql`select v.group_id, count(*)::int n from evidence_items e join ventures v on v.id=e.venture_id where v.group_id = any(${ids}) group by v.group_id`),
      count(sql`select v.group_id, count(*)::int n from assumptions a join ventures v on v.id=a.venture_id where v.group_id = any(${ids}) group by v.group_id`),
      count(sql`select v.group_id, count(*)::int n from experiments x join ventures v on v.id=x.venture_id where x.status='done' and v.group_id = any(${ids}) group by v.group_id`),
      count(sql`select v.group_id, count(*)::int n from experiments x join ventures v on v.id=x.venture_id where x.status='planned' and v.group_id = any(${ids}) group by v.group_id`),
      count(sql`select group_id, count(*)::int n from ai_advisor_messages where role='student' and group_id = any(${ids}) group by group_id`),
      sql<{ group_id: string; at: string }>`select group_id, max(created_at)::text at from activity_events where group_id = any(${ids}) and student_id is not null group by group_id`,
      count(sql`select gm.group_id, count(*)::int n from group_members gm join students s on s.id=gm.student_id where s.is_synthetic and gm.group_id = any(${ids}) group by gm.group_id`),
    ]);
    const ventures = new Map((await sql<{ group_id: string; name: string; created_at: string }>`
      select group_id, name, created_at::text from ventures where group_id = any(${ids})`).map((v) => [v.group_id, v]));
    const last = new Map(lastActive.map((r) => [r.group_id, r.at]));
    const now = Date.now();
    const rows = groups.map((g) => {
      const m = members.get(g.id) ?? 0, s = submitted.get(g.id) ?? 0, v = ventures.get(g.id);
      const lastAt = last.get(g.id) ?? g.created_at;
      const idle = (now - new Date(lastAt).getTime()) / DAY;
      const flags: string[] = [];
      if (idle >= 7) flags.push(`Quiet for ${Math.floor(idle)} days`);
      if (g.status === "opportunity_collection" && m - s > 0 && (now - new Date(g.created_at).getTime()) / DAY >= 7) flags.push(`${m - s} still to submit`);
      if (v && (evidence.get(g.id) ?? 0) === 0 && (now - new Date(v.created_at).getTime()) / DAY >= 5) flags.push("No evidence yet");
      if (v && (assumptions.get(g.id) ?? 0) > 0 && (testsDone.get(g.id) ?? 0) + (testsPlanned.get(g.id) ?? 0) === 0) flags.push("No tests planned");
      return {
        id: g.id, name: g.group_name, number: Number(g.group_number), status: g.status, capacity: Number(g.capacity),
        members: m, submitted: s, voted: voted.get(g.id) ?? 0, venture: v?.name ?? null,
        evidence: evidence.get(g.id) ?? 0, assumptions: assumptions.get(g.id) ?? 0,
        testsDone: testsDone.get(g.id) ?? 0, testsPlanned: testsPlanned.get(g.id) ?? 0,
        aiMessages: aiMsgs.get(g.id) ?? 0, lastActiveAt: lastAt, flags,
        selectionOpenedByLecturer: Boolean(g.selection_opened_by), isDemo: (synthetic.get(g.id) ?? 0) > 0,
      };
    });
    return {
      offering, offerings, groups: rows,
      totals: {
        groups: rows.length,
        students: rows.reduce((t, r) => t + r.members, 0),
        ventures: rows.filter((r) => r.venture).length,
        evidence: rows.reduce((t, r) => t + r.evidence, 0),
        experiments: rows.reduce((t, r) => t + r.testsDone, 0),
      },
    };
  });

export const getGroupDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireTeaches(sql, context.userId, data.groupId);
    const gid = data.groupId;
    const [group] = await sql<Row>`select id, group_name, group_number, status, join_code, capacity, selection_opened_by, created_at::text from groups where id = ${gid}`;
    const members = await sql<{ student_id: string; full_name: string; index_number: string; programme: string; is_synthetic: boolean; joined_at: string }>`
      select gm.student_id, s.full_name, s.index_number, s.programme, s.is_synthetic, gm.joined_at::text
      from group_members gm join students s on s.id = gm.student_id where gm.group_id = ${gid} and gm.membership_status = 'active' order by gm.joined_at`;
    const events = await sql<{ student_id: string | null; event_type: string; created_at: string; metadata: string | null; entity_type: string | null }>`
      select student_id, event_type, created_at::text, metadata, entity_type from activity_events where group_id = ${gid} order by created_at desc limit 400`;
    const opportunities = await sql<Row>`
      select o.id, o.student_id, s.full_name as author, o.problem, o.affected_people, o.context, o.observed_evidence, o.current_alternatives,
        o.why_it_matters, o.possible_solution, o.potential_customer, o.revenue_mechanism, o.uncertainties, o.status, o.submitted_at::text
      from opportunities o join students s on s.id = o.student_id where o.group_id = ${gid} order by o.submitted_at nulls last`;
    const preferences = await sql<Row>`
      select p.student_id, s.full_name as student, p.opportunity_id, p.rationale, p.created_at::text
      from opportunity_preferences p join students s on s.id = p.student_id join opportunities o on o.id = p.opportunity_id where o.group_id = ${gid}`;
    const proposals = await sql<Row>`
      select p.id, p.opportunity_id, p.name, p.rationale, p.status, p.created_at::text, s.full_name as proposer
      from venture_proposals p join students s on s.id = p.proposed_by_student_id where p.group_id = ${gid} order by p.created_at`;
    const responses = await sql<Row>`
      select r.proposal_id, s.full_name as student, r.stance, r.comment from proposal_responses r
      join students s on s.id = r.student_id join venture_proposals p on p.id = r.proposal_id where p.group_id = ${gid}`;
    const [venture] = await sql<Row>`select id, name, selection_rationale, opportunity_id, created_at::text from ventures where group_id = ${gid}`;
    const vid = (venture?.id as string) ?? "";
    const evidence = vid ? await sql<Row>`
      select e.id, e.title, e.content, e.source_type, e.classification, e.photo_thumb, (e.photo_data is not null) as has_photo, s.full_name as author, e.created_at::text
      from evidence_items e join students s on s.id = e.student_id where e.venture_id = ${vid} order by e.created_at desc` : [];
    const assumptions = vid ? await sql<Row>`
      select a.id, a.statement, a.importance, a.confidence, a.status, s.full_name as author,
        (select count(*)::int from assumption_evidence ae where ae.assumption_id = a.id and ae.relationship_type='supports') as supports,
        (select count(*)::int from assumption_evidence ae where ae.assumption_id = a.id and ae.relationship_type='challenges') as challenges
      from assumptions a join students s on s.id = a.student_id where a.venture_id = ${vid} order by a.created_at` : [];
    const experiments = vid ? await sql<Row>`
      select x.id, x.assumption_id, x.hypothesis, x.method, x.success_criteria, x.sample_target, x.status, x.result, x.learning, s.full_name as author, x.completed_at::text
      from experiments x join students s on s.id = x.student_id where x.venture_id = ${vid} order by x.created_at` : [];
    const messages = await sql<Row>`
      select m.role, m.content, m.metadata, m.created_at::text, s.full_name as student, se.stage
      from ai_advisor_messages m left join students s on s.id = m.student_id join ai_advisor_sessions se on se.id = m.session_id
      where m.group_id = ${gid} order by m.created_at`;
    const notes = await sql<Row>`select id, author_name, body, created_at::text from lecturer_notes where group_id = ${gid} order by created_at desc`;

    // Contribution: what each member actually did, from the append-only activity log.
    const KINDS: Record<string, string> = {
      PROPOSAL_MADE: "response", PROPOSAL_ENDORSED: "response", PROPOSAL_OBJECTED: "response",
      EVIDENCE_CREATED: "evidence", ASSUMPTION_CREATED: "assumption", EVIDENCE_LINKED: "link", EXPERIMENT_PLANNED: "test", EXPERIMENT_COMPLETED: "test",
    };
    const aiByStudent = new Map<string, number>();
    for (const m of messages) if (m.role === "student" && m.student) aiByStudent.set(String(m.student), (aiByStudent.get(String(m.student)) ?? 0) + 1);
    const contribution = members.map((m) => {
      const mine = events.filter((e) => e.student_id === m.student_id);
      const counts: Record<string, number> = {};
      for (const e of mine) { const k = KINDS[e.event_type]; if (k) counts[k] = (counts[k] ?? 0) + 1; }
      // Ideas and votes come from the records themselves (one each at most), not the log.
      counts.idea = opportunities.filter((o) => o.student_id === m.student_id && o.status !== "draft").length;
      counts.vote = preferences.filter((p) => p.student_id === m.student_id).length;
      return {
        studentId: m.student_id, name: m.full_name, indexNumber: m.index_number, programme: m.programme, isSynthetic: Boolean(m.is_synthetic),
        counts, advisorMessages: aiByStudent.get(m.full_name) ?? 0, lastActiveAt: mine[0]?.created_at ?? null,
      };
    });
    const names = new Map(members.map((m) => [m.student_id, m.full_name]));
    return {
      group, members, contribution, opportunities, preferences, proposals, responses, venture: venture ?? null,
      evidence, assumptions, experiments, messages, notes,
      timeline: events.slice(0, 80).map((e) => ({ ...e, student: e.student_id ? names.get(e.student_id) ?? null : null })),
    };
  });

export const openSelectionEarly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireTeaches(sql, context.userId, data.groupId);
    const [s] = await sql<{ n: number }>`select count(*)::int n from opportunities where group_id = ${data.groupId} and status <> 'draft'`;
    if (Number(s?.n ?? 0) < 2) throw new AppError("TOO_FEW", "At least two ideas need to be submitted before the group can compare.");
    await sql`update groups set selection_opened_by = ${context.userId}, selection_opened_at = now(), updated_at = now() where id = ${data.groupId}`;
    const status = await refreshGroupStatus(data.groupId);
    await withRlsBypass(() => logEvent({ groupId: data.groupId, eventType: "SELECTION_OPENED_BY_LECTURER", entityType: "group", entityId: data.groupId, metadata: { by: context.userId } }));
    return { status };
  });

export const addLecturerNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const body = data.body.trim().slice(0, 2000);
    if (body.length < 3) throw new AppError("INVALID", "Write the note first.");
    const sql = await getSql();
    await requireTeaches(sql, context.userId, data.groupId);
    const [u] = await sql<{ name: string }>`select name from "user" where id = ${context.userId} limit 1`;
    const id = newId();
    await sql`insert into lecturer_notes (id, group_id, author_user_id, author_name, body) values (${id}, ${data.groupId}, ${context.userId}, ${u?.name || "Your lecturer"}, ${body})`;
    await withRlsBypass(() => logEvent({ groupId: data.groupId, eventType: "LECTURER_NOTE", entityType: "lecturer_note", entityId: id }));
    return { id };
  });
