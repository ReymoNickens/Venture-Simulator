import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { APP_NAME } from "@/lib/brand";
import { canViewPeerOpportunities } from "@/lib/domain/state-machine";
import type {
  AdvisorMessage,
  AdvisorSession,
  Assumption,
  AssumptionEvidenceLink,
  CourseOffering,
  EvidenceItem,
  GroupMember,
  Opportunity,
  OpportunityPreference,
  Venture,
  WorkspaceSnapshot,
} from "@/lib/domain/types";
import { loadOfferingForStudent, loadStudent, loadGroupForStudent } from "./authz";

function parseMeta(raw: string | null): Record<string, string | number | boolean | null> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string | number | boolean | null>;
  } catch {
    return null;
  }
}

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WorkspaceSnapshot> => {
    const student = await loadStudent(context.userId);
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
    };
    if (!student) return empty;

    const offering = await loadOfferingForStudent(student.id);
    const group = await loadGroupForStudent(student.id);
    if (!group) return { ...empty, offering };

    const sql = await getSql();
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

    // Reads every member's opportunity row, including peers' pre-selection
    // submissions that opportunities_select's privacy gate would otherwise
    // hide — needed so submission progress ("N of M submitted") is accurate
    // during opportunity_collection, before selection opens. The content
    // filtering that actually enforces opportunity privacy toward the client
    // happens below in `visibleOpportunities`; this bypass only widens what
    // this server-side computation can see, not what gets returned.
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

    const submittedIds = new Set(
      allOpps.filter((o) => o.status !== "draft").map((o) => o.studentId),
    );

    const prefRows = await sql<{
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
    `;
    const preferences: OpportunityPreference[] = peersVisible
      ? prefRows.map((row) => ({
          id: row.id,
          opportunityId: row.opportunity_id,
          studentId: row.student_id,
          preferenceRank: Number(row.preference_rank),
          rationale: row.rationale,
          createdAt: String(row.created_at ?? ""),
          studentName: row.student_name,
        }))
      : prefRows
          .filter((row) => row.student_id === student.id)
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
    const recorded = activeMembers.filter((m) => m.hasRecordedPreference).length;

    const ventureRows = await sql<{
      id: string;
      group_id: string;
      opportunity_id: string;
      name: string;
      status: string;
      selection_rationale: string;
      created_at: unknown;
      updated_at: unknown;
    }>`select * from ventures where group_id = ${group.id} limit 1`;
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

    let evidence: EvidenceItem[] = [];
    let assumptions: Assumption[] = [];
    let links: AssumptionEvidenceLink[] = [];
    if (venture) {
      const evRows = await sql<{
        id: string;
        venture_id: string;
        student_id: string;
        title: string;
        content: string;
        source_type: string;
        classification: string;
        photo_data: string | null;
        photo_mime: string | null;
        observed_at: string | null;
        location_context: string | null;
        created_at: unknown;
        updated_at: unknown;
        author_name: string;
      }>`
        select e.*, s.full_name as author_name
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
        photoData: row.photo_data,
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
      if (assumptions.length) {
        const ids = assumptions.map((a) => a.id);
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
        const linkRows = await sql.query<{
          id: string;
          assumption_id: string;
          evidence_item_id: string;
          relationship_type: string;
          created_by_student_id: string;
          created_at: unknown;
        }>(
          `select * from assumption_evidence where assumption_id in (${placeholders})`,
          ids,
        );
        links = linkRows.map((row) => ({
          id: row.id,
          assumptionId: row.assumption_id,
          evidenceItemId: row.evidence_item_id,
          relationshipType: row.relationship_type as AssumptionEvidenceLink["relationshipType"],
          createdByStudentId: row.created_by_student_id,
          createdAt: String(row.created_at ?? ""),
        }));
      }
    }

    const sessionRows = await sql<{
      id: string;
      venture_id: string | null;
      group_id: string;
      stage: string;
      created_at: unknown;
    }>`
      select id, venture_id, group_id, stage, created_at
      from ai_advisor_sessions
      where group_id = ${group.id}
      order by created_at desc
    `;
    const messageRows = await sql<{
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
    `;
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

    const required = activeMembers.length;
    const canOpenSelection =
      group.status === "selection_ready" ||
      group.status === "selection" ||
      group.status === "venture_created";
    const canRecordGroupDecision =
      canOpenSelection &&
      Boolean(myPreference) &&
      recorded >= required &&
      !venture;

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
      submissionProgress: { submitted, required },
      preferenceProgress: { recorded, required },
      canOpenSelection,
      canRecordGroupDecision,
      aiAvailable: Boolean(process.env.XAI_API_KEY),
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
      course_code: string;
      course_name: string;
    }>`
      select o.id, o.course_id, o.semester, o.academic_year, o.default_group_size,
             o.selection_requires_all_active, o.max_photo_bytes,
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
      courseCode: row.course_code,
      courseName: row.course_name,
    }));
  });
