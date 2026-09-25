import { getSql, withRlsBypass } from "@/lib/db";
import { attentionScore, groupFlags, type Flag } from "@/lib/domain/flags";
import { CANVAS_BLOCKS, STAGE_BY_ID, stageProgress, type StageId, type StageInput } from "@/lib/domain/stages";
import { computeFinance, parseFinanceInputs } from "@/lib/domain/finance";
import { AppError } from "./authz";

// Server-only helpers for the lecturer console. Never import from client code.

export interface StaffContext {
  staffId: string;
  fullName: string;
  offeringIds: string[];
}

export async function loadStaff(userId: string): Promise<StaffContext | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; full_name: string }>`
    select id, full_name from staff where auth_user_id = ${userId} limit 1
  `;
  if (!rows[0]) return null;
  const roles = await sql<{ course_offering_id: string | null }>`
    select ur.course_offering_id from user_roles ur
    join app_roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and r.name in ('lecturer', 'admin')
  `;
  if (!roles.length) return null;
  return {
    staffId: rows[0].id,
    fullName: rows[0].full_name,
    offeringIds: roles.map((r) => r.course_offering_id).filter((x): x is string => Boolean(x)),
  };
}

export async function requireStaff(userId: string, offeringId?: string): Promise<StaffContext> {
  const staff = await loadStaff(userId);
  if (!staff) throw new AppError("NOT_STAFF", "This account is not registered as teaching staff.");
  if (offeringId && !staff.offeringIds.includes(offeringId)) {
    throw new AppError("FORBIDDEN", "You do not teach that course offering.");
  }
  return staff;
}

export async function requireStaffForGroup(userId: string, groupId: string): Promise<StaffContext & { offeringId: string }> {
  const staff = await requireStaff(userId);
  const sql = await getSql();
  const g = await sql<{ course_offering_id: string }>`select course_offering_id from groups where id = ${groupId} limit 1`;
  if (!g[0]) throw new AppError("NOT_FOUND", "Group not found.");
  if (!staff.offeringIds.includes(g[0].course_offering_id)) {
    throw new AppError("FORBIDDEN", "That group is not in a course you teach.");
  }
  return { ...staff, offeringId: g[0].course_offering_id };
}

export interface CohortGroup {
  id: string;
  groupNumber: number;
  groupName: string;
  status: string;
  ventureName: string | null;
  ventureStatus: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  activeMembers: number;
  realMembers: number;
  isDemo: boolean;
  currentStage: StageId | null;
  stagesDone: number;
  lastActivityAt: string | null;
  flags: Flag[];
  score: number;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const days = (from: string | null, now: number) =>
  from ? Math.floor((now - new Date(from).getTime()) / 86_400_000) : null;

/**
 * Every group in an offering, with its stage, flags and attention score —
 * built from a fixed number of set-based queries (not one per group), so the
 * console stays fast at hundreds of groups.
 */
export async function loadCohort(offeringId: string, onlyGroupId?: string): Promise<CohortGroup[]> {
  const sql = await getSql();
  const now = Date.now();
  return withRlsBypass(async () => {
    const groups = await sql<Record<string, unknown>>`
      select g.id, g.group_number, g.group_name, g.status, g.updated_at, g.assigned_staff_id,
             st.full_name as staff_name, v.id as venture_id, v.name as venture_name, v.status as venture_status
      from groups g
      left join ventures v on v.group_id = g.id
      left join staff st on st.id = g.assigned_staff_id
      where g.course_offering_id = ${offeringId}
        and (${onlyGroupId ?? null}::text is null or g.id = ${onlyGroupId ?? null})
      order by g.group_number
    `;
    if (!groups.length) return [];
    const members = await sql<Record<string, unknown>>`
      select gm.group_id, gm.student_id, s.full_name, s.is_synthetic,
             exists (select 1 from opportunities o where o.student_id = gm.student_id and o.group_id = gm.group_id and o.status <> 'draft') as submitted,
             exists (select 1 from opportunity_preferences p join opportunities o on o.id = p.opportunity_id
                     where p.student_id = gm.student_id and o.group_id = gm.group_id) as preferred,
             (select max(a.created_at) from activity_events a where a.student_id = gm.student_id and a.group_id = gm.group_id) as last_at
      from group_members gm join students s on s.id = gm.student_id
      join groups g on g.id = gm.group_id
      where g.course_offering_id = ${offeringId} and gm.membership_status = 'active'
    `;
    const lastGroup = await sql<{ group_id: string; last_at: unknown }>`
      select a.group_id, max(a.created_at) as last_at
      from activity_events a join groups g on g.id = a.group_id
      where g.course_offering_id = ${offeringId}
      group by a.group_id
    `;
    const ventureStats = await sql<Record<string, unknown>>`
      select v.id as venture_id,
        (select count(*)::int from evidence_items e where e.venture_id = v.id) as evidence,
        (select count(*)::int from evidence_items e where e.venture_id = v.id and e.classification in ('opinion','assumption')) as weak_evidence,
        (select count(*)::int from evidence_items e where e.venture_id = v.id and e.created_at > now() - interval '7 days') as evidence_7d,
        (select count(*)::int from assumptions a where a.venture_id = v.id) as assumptions,
        (select count(*)::int from assumptions a where a.venture_id = v.id and a.importance = 'critical') as critical,
        (select count(*)::int from assumptions a where a.venture_id = v.id and a.importance = 'critical'
            and not exists (select 1 from assumption_evidence ae where ae.assumption_id = a.id)) as critical_untested,
        (select count(distinct ae.assumption_id)::int from assumption_evidence ae join assumptions a on a.id = ae.assumption_id where a.venture_id = v.id) as linked,
        (select count(*)::int from interviews i where i.venture_id = v.id) as interviews,
        (select coalesce(json_agg(distinct i.student_id)::text, '[]') from interviews i where i.venture_id = v.id) as interviewers,
        (select count(*)::int from assumption_evidence ae join interviews i on i.evidence_item_id = ae.evidence_item_id where i.venture_id = v.id) as interview_links,
        (select coalesce(json_agg(distinct c.block)::text, '[]') from canvas_entries c where c.venture_id = v.id and c.status = 'active') as blocks,
        (select coalesce(json_agg(distinct c.block)::text, '[]') from canvas_entries c where c.venture_id = v.id and c.status = 'active'
            and exists (select 1 from canvas_entry_evidence l where l.entry_id = c.id)) as evidenced_blocks,
        (select count(distinct f.lens)::int from feasibility_assessments f where f.venture_id = v.id) as lenses,
        (select count(*)::int from (select distinct on (f.lens) f.evidence_ids from feasibility_assessments f
            where f.venture_id = v.id order by f.lens, f.created_at desc) x where x.evidence_ids <> '[]') as lenses_evidenced,
        (select f.inputs from financial_models f where f.venture_id = v.id order by f.created_at desc limit 1) as finance,
        (select count(*)::int from prototypes p where p.venture_id = v.id) as prototypes,
        (select count(*)::int from prototype_tests t where t.venture_id = v.id) as tests,
        (select count(*)::int from prototype_tests t where t.venture_id = v.id and t.created_at > now() - interval '7 days') as tests_7d,
        (select count(*)::int from interviews i where i.venture_id = v.id and i.created_at > now() - interval '7 days') as interviews_7d,
        exists (select 1 from venture_decisions d where d.venture_id = v.id and d.status = 'ratified') as decided,
        (select coalesce(json_agg(distinct p.section)::text, '[]') from plan_sections p where p.venture_id = v.id) as plan
      from ventures v join groups g on g.id = v.group_id
      where g.course_offering_id = ${offeringId}
    `;
    const advisor = await sql<{ group_id: string; n: number }>`
      select m.group_id, count(*)::int as n
      from ai_advisor_messages m join groups g on g.id = m.group_id
      where g.course_offering_id = ${offeringId} and m.role = 'student' and m.created_at > now() - interval '7 days'
      group by m.group_id
    `;
    const config = await sql<{ interviews_per_member: number; min_prototype_tests: number }>`
      select interviews_per_member, min_prototype_tests from course_offerings where id = ${offeringId}
    `;
    const milestones = await sql<{ stage: string; due_at: unknown }>`
      select stage, due_at from milestones where course_offering_id = ${offeringId}
    `;
    const shocks = await sql<{ group_id: string; missing: number }>`
      select g.id as group_id, count(*)::int as missing
      from market_events e
      join groups g on g.course_offering_id = e.course_offering_id and (e.group_id is null or e.group_id = g.id)
      join group_members gm on gm.group_id = g.id and gm.membership_status = 'active'
      join students s on s.id = gm.student_id and s.is_synthetic = false
      where e.course_offering_id = ${offeringId} and e.respond_by < now()
        and not exists (select 1 from event_responses r where r.event_id = e.id and r.student_id = gm.student_id)
      group by g.id
    `;

    const perMember = Number(config[0]?.interviews_per_member ?? 2);
    const minTests = Number(config[0]?.min_prototype_tests ?? 5);
    const parse = (raw: unknown): string[] => {
      try {
        const v = JSON.parse(String(raw ?? "[]")) as unknown;
        return Array.isArray(v) ? v.map(String) : [];
      } catch {
        return [];
      }
    };

    return groups
      .map((g) => {
        const gid = String(g.id);
        const mem = members.filter((m) => m.group_id === gid);
        const real = mem.filter((m) => !(m.is_synthetic === true || m.is_synthetic === "t"));
        const vs = ventureStats.find((x) => x.venture_id === g.venture_id);
        const fin = vs?.finance ? parseFinanceInputs(String(vs.finance)) : null;
        const finRes = fin ? computeFinance(fin) : null;
        const interviewers = new Set(parse(vs?.interviewers));
        const input: StageInput = {
          inGroup: true,
          activeMembers: mem.length,
          mySubmitted: real.length > 0 && real.every((m) => m.submitted === true || m.submitted === "t"),
          submittedCount: mem.filter((m) => m.submitted === true || m.submitted === "t").length,
          myPreference: real.length > 0 && real.every((m) => m.preferred === true || m.preferred === "t"),
          hasVenture: Boolean(g.venture_id),
          assumptions: Number(vs?.assumptions ?? 0),
          criticalAssumptions: Number(vs?.critical ?? 0),
          evidence: Number(vs?.evidence ?? 0),
          linkedAssumptions: Number(vs?.linked ?? 0),
          interviews: Number(vs?.interviews ?? 0),
          interviewersMissing: real.filter((m) => !interviewers.has(String(m.student_id))).map((m) => String(m.full_name)),
          interviewsPerMember: perMember,
          interviewLinkedToAssumption: Number(vs?.interview_links ?? 0) > 0,
          canvasBlocksFilled: CANVAS_BLOCKS.filter((b) => parse(vs?.blocks).includes(b.key)).length,
          canvasBlocksEvidenced: CANVAS_BLOCKS.filter((b) => parse(vs?.evidenced_blocks).includes(b.key)).length,
          feasibilityLenses: Number(vs?.lenses ?? 0),
          feasibilityLensesEvidenced: Number(vs?.lenses_evidenced ?? 0),
          hasFinanceModel: Boolean(fin),
          financePriceEvidenced: Boolean(fin?.priceEvidenceId),
          financeCostsSourcedShare: finRes?.sourcedShare ?? 0,
          financeBreakEven: finRes?.breakEvenUnits != null,
          prototypes: Number(vs?.prototypes ?? 0),
          prototypeTests: Number(vs?.tests ?? 0),
          minPrototypeTests: minTests,
          decisionRatified: vs?.decided === true || vs?.decided === "t",
          // Individual items (reflection, peer rating) aren't part of the group view.
          myDecideReflection: true,
          myPeerRatingsDone: true,
          planSectionsWritten: parse(vs?.plan),
        };
        const progress = stageProgress(input);
        const current = progress.find((p) => p.state === "current")?.id ?? null;
        const done = new Set(progress.filter((p) => p.state === "done").map((p) => p.id));
        const lastAt = iso(lastGroup.find((l) => l.group_id === gid)?.last_at);
        const waitingOn =
          g.status === "opportunity_collection"
            ? real.filter((m) => !(m.submitted === true || m.submitted === "t"))
            : g.status === "selection" || g.status === "selection_ready"
              ? real.filter((m) => !(m.preferred === true || m.preferred === "t"))
              : [];
        const silent = real.filter((m) => {
          const d = days(iso(m.last_at), now);
          return d === null || d >= 14;
        });
        const flags = groupFlags({
          activeMembers: real.length,
          daysSinceActivity: days(lastAt, now),
          silentMembers: mem.length > 1 ? silent.map((m) => String(m.full_name)) : [],
          waitingOn: waitingOn.map((m) => String(m.full_name)),
          waitingDays: days(iso(g.updated_at), now) ?? 0,
          criticalAssumptions: Number(vs?.critical ?? 0),
          criticalUntested: Number(vs?.critical_untested ?? 0),
          evidence: Number(vs?.evidence ?? 0),
          opinionOrAssumptionEvidence: Number(vs?.weak_evidence ?? 0),
          advisorMessages7d: advisor.find((a) => a.group_id === gid)?.n ?? 0,
          fieldRecords7d:
            Number(vs?.evidence_7d ?? 0) + Number(vs?.interviews_7d ?? 0) + Number(vs?.tests_7d ?? 0),
          overdueStages: milestones
            .filter((m) => new Date(String(iso(m.due_at))).getTime() < now && !done.has(m.stage as StageId))
            .map((m) => STAGE_BY_ID[m.stage as StageId]?.title ?? m.stage),
          unansweredShocks: shocks.find((s) => s.group_id === gid)?.missing ? 1 : 0,
        });
        return {
          id: gid,
          groupNumber: Number(g.group_number),
          groupName: String(g.group_name),
          status: String(g.status),
          ventureName: g.venture_name ? String(g.venture_name) : null,
          ventureStatus: g.venture_status ? String(g.venture_status) : null,
          assignedStaffId: g.assigned_staff_id ? String(g.assigned_staff_id) : null,
          assignedStaffName: g.staff_name ? String(g.staff_name) : null,
          activeMembers: mem.length,
          realMembers: real.length,
          isDemo: real.length <= 1 && mem.length > real.length,
          currentStage: current,
          stagesDone: done.size,
          lastActivityAt: lastAt,
          flags,
          score: attentionScore(flags),
        } satisfies CohortGroup;
      })
      .sort((a, b) => b.score - a.score || a.groupNumber - b.groupNumber);
  });
}
