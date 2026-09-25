import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { APP_NAME } from "@/lib/brand";
import {
  advisorAllowance,
  canEditOpportunity,
  canViewPeerOpportunities,
  endorsementsNeeded,
  preferencesRevealed,
} from "@/lib/domain/state-machine";
import type {
  AdvisorMessage,
  AdvisorSession,
  Assumption,
  AssumptionEvidenceLink,
  CourseOffering,
  EvidenceItem,
  Experiment,
  GroupMember,
  LecturerNote,
  Opportunity,
  OpportunityPreference,
  Venture,
  VentureProposal,
  WorkspaceSnapshot,
} from "@/lib/domain/types";
import { loadGroupForStudent, loadOfferingForStudent, loadStudent, votingRoll } from "./authz";

function parseMeta(raw: string | null): Record<string, string | number | boolean | null> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string | number | boolean | null>;
  } catch {
    return null;
  }
}

async function isLecturer(userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from user_roles ur join app_roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and r.name in ('lecturer', 'admin')
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WorkspaceSnapshot> => {
    const student = await loadStudent(context.userId);
    const lecturer = await isLecturer(context.userId);
    const empty: WorkspaceSnapshot = {
      appName: APP_NAME,
      student,
      offering: null,
      group: null,
      members: [],
      myOpportunity: null,
      visibleOpportunities: [],
      preferences: [],
      myPreference: null,
      venture: null,
      evidence: [],
      assumptions: [],
      links: [],
      advisorSessions: [],
      activity: [],
      submissionProgress: { submitted: 0, required: 0 },
      preferenceProgress: { recorded: 0, required: 0 },
      canOpenSelection: false,
      canRecordGroupDecision: false,
      aiAvailable: Boolean(process.env.XAI_API_KEY),
      canEditMyOpportunity: false,
      preferencesRevealed: false,
      eligibleVoterIds: [],
      proposal: null,
      pastProposals: [],
      experiments: [],
      notes: [],
      advisorLeftToday: 0,
      isLecturer: lecturer,
    };
    if (!student) return empty;

    const offering = await loadOfferingForStudent(student.id);
    const group = await loadGroupForStudent(student.id);
    const sql = await getSql();
    const [used] = await sql<{ n: number }>`
      select count(*)::int as n from ai_advisor_messages
      where student_id = ${student.id} and role = 'student' and created_at > now() - interval '1 day'
    `;
    const advisorLeftToday = advisorAllowance(Number(used?.n ?? 0), offering?.aiMessagesPerDay ?? 40).left;
    if (!group) return { ...empty, offering, advisorLeftToday };

    const memberRows = await sql<{
      id: string;
      group_id: string;
      student_id: string;
      membership_status: string;
      joined_at: unknown;
      full_name: string;
      is_synthetic: boolean | string;
    }>`
      select gm.id, gm.group_id, gm.student_id, gm.membership_status, gm.joined_at,
             s.full_name, s.is_synthetic
      from group_members gm
      join students s on s.id = gm.student_id
      where gm.group_id = ${group.id}
      order by gm.joined_at asc
    `;

    // System read of every member's opportunity, so progress ("7 of 10 submitted") is
    // accurate while ideas are private. Only visibleOpportunities below leaves the server.
    const oppRows = await withRlsBypass(
      () => sql<{
        id: string;
        student_id: string;
        group_id: string;
        problem: string;
        affected_people: string;
        context: string;
        observed_evidence: string;
        current_alternatives: string;
        why_it_matters: string;
        possible_solution: string;
        potential_customer: string;
        revenue_mechanism: string;
        uncertainties: string;
        status: string;
        submitted_at: unknown;
        created_at: unknown;
        updated_at: unknown;
        author_name: string;
      }>`
        select o.*, s.full_name as author_name
        from opportunities o
        join students s on s.id = o.student_id
        where o.group_id = ${group.id}
      `,
    );

    const mapOpp = (row: (typeof oppRows)[number]): Opportunity => ({
      id: row.id,
      studentId: row.student_id,
      groupId: row.group_id,
      problem: row.problem,
      affectedPeople: row.affected_people,
      context: row.context,
      observedEvidence: row.observed_evidence,
      currentAlternatives: row.current_alternatives,
      whyItMatters: row.why_it_matters,
      possibleSolution: row.possible_solution,
      potentialCustomer: row.potential_customer,
      revenueMechanism: row.revenue_mechanism,
      uncertainties: row.uncertainties,
      status: row.status as Opportunity["status"],
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      authorName: row.author_name,
      syncState: "synced",
    });

    const allOpps = oppRows.map(mapOpp);
    const myOpportunity = allOpps.find((o) => o.studentId === student.id) ?? null;
    const peersVisible = canViewPeerOpportunities(group.status);
    const visibleOpportunities = allOpps.filter((o) => {
      if (o.studentId === student.id) return true;
      if (!peersVisible) return false;
      return o.status !== "draft";
    });
    const submittedIds = new Set(allOpps.filter((o) => o.status !== "draft").map((o) => o.studentId));

    // Votes are sealed until every voter has voted: before that you see only your own,
    // plus who has voted (not what they chose).
    const roll = await votingRoll(group.id, Boolean(group.selectionOpenedBy));
    const revealed = preferencesRevealed(roll.recorded, roll.eligible.length);
    const prefRows = await withRlsBypass(() => sql<{
      id: string;
      opportunity_id: string;
      student_id: string;
      preference_rank: number;
      rationale: string;
      created_at: unknown;
      student_name: string;
    }>`
      select p.id, p.opportunity_id, p.student_id, p.preference_rank, p.rationale, p.created_at,
             s.full_name as student_name
      from opportunity_preferences p
      join students s on s.id = p.student_id
      join opportunities o on o.id = p.opportunity_id
      where o.group_id = ${group.id}
    `);
    const preferences: OpportunityPreference[] = prefRows
      .filter((row) => revealed || row.student_id === student.id)
      .map((row) => ({
        id: row.id,
        opportunityId: row.opportunity_id,
        studentId: row.student_id,
        preferenceRank: Number(row.preference_rank),
        rationale: row.rationale,
        createdAt: String(row.created_at ?? ""),
        studentName: row.student_name,
      }));
    const myPreference = preferences.find((p) => p.studentId === student.id) ?? null;

    const members: GroupMember[] = memberRows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      studentId: row.student_id,
      membershipStatus: row.membership_status as GroupMember["membershipStatus"],
      joinedAt: String(row.joined_at ?? ""),
      fullName: row.full_name,
      isSynthetic: row.is_synthetic === true || row.is_synthetic === "t",
      hasSubmittedOpportunity: submittedIds.has(row.student_id),
      hasRecordedPreference: prefRows.some((p) => p.student_id === row.student_id),
    }));
    const activeMembers = members.filter((m) => m.membershipStatus === "active");
    const submitted = activeMembers.filter((m) => m.hasSubmittedOpportunity).length;

    const ventureRows = await sql<{
      id: string;
      group_id: string;
      opportunity_id: string;
      name: string;
      status: string;
      selection_rationale: string;
      created_at: unknown;
      updated_at: unknown;
    }>`select id, group_id, opportunity_id, name, status, selection_rationale, created_at, updated_at from ventures where group_id = ${group.id} limit 1`;
    const venture: Venture | null = ventureRows[0]
      ? {
          id: ventureRows[0].id,
          groupId: ventureRows[0].group_id,
          opportunityId: ventureRows[0].opportunity_id,
          name: ventureRows[0].name,
          status: ventureRows[0].status as Venture["status"],
          selectionRationale: ventureRows[0].selection_rationale,
          createdAt: String(ventureRows[0].created_at ?? ""),
          updatedAt: String(ventureRows[0].updated_at ?? ""),
        }
      : null;

    // Proposals: the open one (with who endorsed/objected and why) and the history.
    const needed = endorsementsNeeded(roll.eligible.length, offering?.decisionRule ?? "majority");
    const propRows = await sql<{
      id: string;
      opportunity_id: string;
      proposed_by_student_id: string;
      proposer: string;
      name: string;
      rationale: string;
      status: string;
      created_at: unknown;
    }>`
      select p.id, p.opportunity_id, p.proposed_by_student_id, s.full_name as proposer, p.name, p.rationale, p.status, p.created_at
      from venture_proposals p join students s on s.id = p.proposed_by_student_id
      where p.group_id = ${group.id} order by p.created_at desc
    `;
    const respRows = propRows.length
      ? await sql<{ proposal_id: string; student_id: string; student_name: string; stance: string; comment: string }>`
          select r.proposal_id, r.student_id, s.full_name as student_name, r.stance, r.comment
          from proposal_responses r join students s on s.id = r.student_id
          join venture_proposals p on p.id = r.proposal_id where p.group_id = ${group.id}
          order by r.created_at
        `
      : [];
    const proposals: VentureProposal[] = propRows.map((p) => ({
      id: p.id,
      opportunityId: p.opportunity_id,
      proposedByStudentId: p.proposed_by_student_id,
      proposedByName: p.proposer,
      name: p.name,
      rationale: p.rationale,
      status: p.status as VentureProposal["status"],
      createdAt: String(p.created_at ?? ""),
      responses: respRows
        .filter((r) => r.proposal_id === p.id)
        .map((r) => ({ studentId: r.student_id, studentName: r.student_name, stance: r.stance as "endorse" | "object", comment: r.comment })),
      needed,
    }));

    let evidence: EvidenceItem[] = [];
    let assumptions: Assumption[] = [];
    let links: AssumptionEvidenceLink[] = [];
    let experiments: Experiment[] = [];
    if (venture) {
      // Thumbnails only: a group's full photos would be many MB on every load.
      const evRows = await sql<{
        id: string;
        venture_id: string;
        student_id: string;
        title: string;
        content: string;
        source_type: string;
        classification: string;
        photo_thumb: string | null;
        has_photo: boolean;
        photo_mime: string | null;
        observed_at: string | null;
        location_context: string | null;
        created_at: unknown;
        updated_at: unknown;
        author_name: string;
      }>`
        select e.id, e.venture_id, e.student_id, e.title, e.content, e.source_type, e.classification,
               e.photo_thumb, (e.photo_data is not null) as has_photo, e.photo_mime, e.observed_at,
               e.location_context, e.created_at, e.updated_at, s.full_name as author_name
        from evidence_items e
        join students s on s.id = e.student_id
        where e.venture_id = ${venture.id}
        order by e.created_at desc
      `;
      evidence = evRows.map((row) => ({
        id: row.id,
        ventureId: row.venture_id,
        studentId: row.student_id,
        title: row.title,
        content: row.content,
        sourceType: row.source_type as EvidenceItem["sourceType"],
        classification: row.classification as EvidenceItem["classification"],
        photoData: null,
        photoThumb: row.photo_thumb,
        hasPhoto: Boolean(row.has_photo),
        photoMime: row.photo_mime,
        observedAt: row.observed_at,
        locationContext: row.location_context,
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
        authorName: row.author_name,
        syncState: "synced",
      }));
      const asRows = await sql<{
        id: string;
        venture_id: string;
        student_id: string;
        statement: string;
        importance: string;
        confidence: string;
        status: string;
        created_at: unknown;
        updated_at: unknown;
        author_name: string;
      }>`
        select a.*, s.full_name as author_name
        from assumptions a
        join students s on s.id = a.student_id
        where a.venture_id = ${venture.id}
        order by a.created_at desc
      `;
      assumptions = asRows.map((row) => ({
        id: row.id,
        ventureId: row.venture_id,
        studentId: row.student_id,
        statement: row.statement,
        importance: row.importance as Assumption["importance"],
        confidence: row.confidence as Assumption["confidence"],
        status: row.status as Assumption["status"],
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
        authorName: row.author_name,
        syncState: "synced",
      }));
      const linkRows = await sql<{
        id: string;
        assumption_id: string;
        evidence_item_id: string;
        relationship_type: string;
        created_by_student_id: string;
        created_at: unknown;
      }>`
        select ae.* from assumption_evidence ae
        join assumptions a on a.id = ae.assumption_id
        where a.venture_id = ${venture.id}
      `;
      links = linkRows.map((row) => ({
        id: row.id,
        assumptionId: row.assumption_id,
        evidenceItemId: row.evidence_item_id,
        relationshipType: row.relationship_type as AssumptionEvidenceLink["relationshipType"],
        createdByStudentId: row.created_by_student_id,
        createdAt: String(row.created_at ?? ""),
      }));
      const xRows = await sql<{
        id: string;
        venture_id: string;
        assumption_id: string;
        student_id: string;
        author_name: string;
        hypothesis: string;
        method: string;
        success_criteria: string;
        sample_target: number | null;
        status: string;
        result: string | null;
        learning: string | null;
        completed_at: unknown;
        created_at: unknown;
      }>`
        select x.*, s.full_name as author_name from experiments x
        join students s on s.id = x.student_id
        where x.venture_id = ${venture.id} order by x.created_at desc
      `;
      const xev = xRows.length
        ? await sql<{ experiment_id: string; evidence_item_id: string }>`
            select xe.experiment_id, xe.evidence_item_id from experiment_evidence xe
            join experiments x on x.id = xe.experiment_id where x.venture_id = ${venture.id}
          `
        : [];
      experiments = xRows.map((x) => ({
        id: x.id,
        ventureId: x.venture_id,
        assumptionId: x.assumption_id,
        studentId: x.student_id,
        authorName: x.author_name,
        hypothesis: x.hypothesis,
        method: x.method as Experiment["method"],
        successCriteria: x.success_criteria,
        sampleTarget: x.sample_target == null ? null : Number(x.sample_target),
        status: x.status as Experiment["status"],
        result: (x.result as Experiment["result"]) ?? null,
        learning: x.learning,
        evidenceIds: xev.filter((e) => e.experiment_id === x.id).map((e) => e.evidence_item_id),
        completedAt: x.completed_at ? String(x.completed_at) : null,
        createdAt: String(x.created_at ?? ""),
      }));
    }

    // RLS returns only sessions this student may read (shared group sessions + their own private ones).
    const sessionRows = await sql<{
      id: string;
      venture_id: string | null;
      group_id: string;
      stage: string;
      created_at: unknown;
    }>`
      select id, venture_id, group_id, stage, created_at
      from ai_advisor_sessions
      where group_id = ${group.id} and (student_id is null or student_id = ${student.id})
      order by created_at desc
    `;
    const sessionIds = new Set(sessionRows.map((s) => s.id));
    const messageRows = (await sql<{
      id: string;
      session_id: string;
      venture_id: string | null;
      group_id: string;
      student_id: string | null;
      role: string;
      content: string;
      metadata: string | null;
      created_at: unknown;
    }>`
      select * from ai_advisor_messages
      where group_id = ${group.id}
      order by created_at asc
    `).filter((m) => sessionIds.has(m.session_id));
    const advisorSessions: AdvisorSession[] = sessionRows.map((s) => ({
      id: s.id,
      ventureId: s.venture_id,
      groupId: s.group_id,
      stage: s.stage as AdvisorSession["stage"],
      createdAt: String(s.created_at ?? ""),
      messages: messageRows
        .filter((m) => m.session_id === s.id)
        .map(
          (m): AdvisorMessage => ({
            id: m.id,
            sessionId: m.session_id,
            ventureId: m.venture_id,
            groupId: m.group_id,
            studentId: m.student_id,
            role: m.role as AdvisorMessage["role"],
            content: m.content,
            metadata: parseMeta(m.metadata) as AdvisorMessage["metadata"],
            createdAt: String(m.created_at ?? ""),
          }),
        ),
    }));

    const actRows = await sql<{
      id: string;
      student_id: string | null;
      group_id: string | null;
      venture_id: string | null;
      event_type: string;
      entity_type: string | null;
      entity_id: string | null;
      metadata: string | null;
      created_at: unknown;
    }>`
      select * from activity_events
      where group_id = ${group.id}
      order by created_at desc
      limit 40
    `;
    const notes: LecturerNote[] = (await sql<{ id: string; group_id: string; author_name: string; body: string; created_at: unknown }>`
      select id, group_id, author_name, body, created_at from lecturer_notes where group_id = ${group.id} order by created_at desc limit 20
    `).map((n) => ({ id: n.id, groupId: n.group_id, authorName: n.author_name, body: n.body, createdAt: String(n.created_at ?? "") }));

    const canOpenSelection = peersVisible;
    const openProposal = proposals.find((p) => p.status === "open") ?? null;
    return {
      appName: APP_NAME,
      student,
      offering,
      group,
      members,
      myOpportunity,
      visibleOpportunities,
      preferences,
      myPreference,
      venture,
      evidence,
      assumptions,
      links,
      advisorSessions,
      activity: actRows.map((row) => ({
        id: row.id,
        studentId: row.student_id,
        groupId: row.group_id,
        ventureId: row.venture_id,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: parseMeta(row.metadata),
        createdAt: String(row.created_at ?? ""),
      })),
      submissionProgress: { submitted, required: activeMembers.length },
      preferenceProgress: { recorded: roll.recorded, required: roll.eligible.length },
      canOpenSelection,
      canRecordGroupDecision: canOpenSelection && revealed && !venture && !openProposal && roll.eligible.includes(student.id),
      aiAvailable: Boolean(process.env.XAI_API_KEY),
      canEditMyOpportunity: canEditOpportunity(myOpportunity?.status ?? "draft", group.status),
      preferencesRevealed: revealed,
      eligibleVoterIds: roll.eligible,
      proposal: openProposal,
      pastProposals: proposals.filter((p) => p.status !== "open"),
      experiments,
      notes,
      advisorLeftToday,
      isLecturer: lecturer,
    };
  });

export const listOfferings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<CourseOffering[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      course_id: string;
      semester: string;
      academic_year: string;
      default_group_size: number;
      selection_requires_all_active: boolean | string;
      max_photo_bytes: number;
      decision_rule: string;
      ai_messages_per_day: number;
      course_code: string;
      course_name: string;
    }>`
      select o.id, o.course_id, o.semester, o.academic_year, o.default_group_size,
             o.selection_requires_all_active, o.max_photo_bytes, o.decision_rule, o.ai_messages_per_day,
             c.course_code, c.course_name
      from course_offerings o
      join courses c on c.id = o.course_id
      order by o.academic_year desc
    `;
    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      semester: row.semester,
      academicYear: row.academic_year,
      defaultGroupSize: Number(row.default_group_size),
      selectionRequiresAllActive:
        row.selection_requires_all_active === true ||
        row.selection_requires_all_active === "t",
      maxPhotoBytes: Number(row.max_photo_bytes),
      decisionRule: row.decision_rule === "all" ? "all" : "majority",
      aiMessagesPerDay: Number(row.ai_messages_per_day ?? 40),
      courseCode: row.course_code,
      courseName: row.course_name,
    }));
  });
