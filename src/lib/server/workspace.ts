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
  VentureProposal,
  WorkspaceSnapshot,
} from "@/lib/domain/types";
import { decisionThreshold } from "@/lib/domain/state-machine";
import { emptyWork, loadCourseLife, loadVentureWork } from "./workspace-venture";
import { loadStaff } from "./lecturer-core";
import {
  loadOfferingForStudent,
  loadStudent,
  loadGroupForStudent,
  mapOffering,
  OFFERING_COLUMNS,
  type OfferingRow,
} from "./authz";

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
    const isStaff = student ? false : Boolean(await loadStaff(context.userId));
    const empty: WorkspaceSnapshot = {
      appName: APP_NAME,
      isStaff,
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
      proposals: [],
      work: emptyWork(),
      life: await loadCourseLife({ studentId: "", groupId: null, offeringId: null }),
      canOpenSelection: false,
      canRecordGroupDecision: false,
      aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    };
    if (!student) return empty;

    const offering = await loadOfferingForStudent(student.id);
    const group = await loadGroupForStudent(student.id);
    if (!group) {
      return {
        ...empty,
        offering,
        life: await loadCourseLife({ studentId: student.id, authUserId: context.userId, groupId: null, offeringId: offering?.id ?? null }),
      };
    }

    const sql = await getSql();
    const memberRows = await sql<{
      id: string;
      group_id: string;
      student_id: string;
      membership_status: string;
      status_reason: string | null;
      joined_at: unknown;
      full_name: string;
      is_synthetic: boolean | string;
    }>`
      select gm.id, gm.group_id, gm.student_id, gm.membership_status, gm.status_reason, gm.joined_at,
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
    // Others' preferences are withheld until you have recorded your own, so a
    // student's first judgement is theirs rather than a vote for the crowd.
    const iHaveRecorded = prefRows.some((row) => row.student_id === student.id);
    const hasVentureAlready = group.status === "venture_created";
    const preferences: OpportunityPreference[] =
      peersVisible && (iHaveRecorded || hasVentureAlready)
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
      statusReason: row.status_reason,
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
        photo_mime: string | null;
        has_photo: boolean;
        observed_at: string | null;
        location_context: string | null;
        created_at: unknown;
        updated_at: unknown;
        author_name: string;
      }>`
        select e.id, e.venture_id, e.student_id, e.title, e.content, e.source_type,
               e.classification, e.photo_mime, (e.photo_data is not null) as has_photo,
               e.observed_at, e.location_context, e.created_at, e.updated_at,
               s.full_name as author_name
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
        photoMime: row.photo_mime,
        hasPhoto: Boolean(row.has_photo),
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
      limit 150
    `;

    const proposalRows = await sql<{
      id: string;
      opportunity_id: string;
      proposed_by_student_id: string;
      proposer_name: string;
      name: string;
      rationale: string;
      status: string;
      created_at: unknown;
    }>`
      select p.id, p.opportunity_id, p.proposed_by_student_id, s.full_name as proposer_name,
             p.name, p.rationale, p.status, p.created_at
      from venture_proposals p
      join students s on s.id = p.proposed_by_student_id
      where p.group_id = ${group.id}
      order by p.created_at desc
    `;
    const voteRows = proposalRows.length
      ? await sql<{
          proposal_id: string;
          student_id: string;
          student_name: string;
          vote: string;
          comment: string;
          created_at: unknown;
        }>`
          select v.proposal_id, v.student_id, s.full_name as student_name, v.vote, v.comment, v.created_at
          from proposal_votes v
          join students s on s.id = v.student_id
          join venture_proposals p on p.id = v.proposal_id
          where p.group_id = ${group.id}
          order by v.created_at asc
        `
      : [];
    const quorumPct = offering?.decisionQuorumPct ?? 51;
    const proposals: VentureProposal[] = proposalRows.map((p) => ({
      id: p.id,
      opportunityId: p.opportunity_id,
      proposedByStudentId: p.proposed_by_student_id,
      proposedByName: p.proposer_name,
      name: p.name,
      rationale: p.rationale,
      status: p.status as VentureProposal["status"],
      createdAt: String(p.created_at ?? ""),
      threshold: decisionThreshold(activeMembers.length, quorumPct),
      votes: voteRows
        .filter((v) => v.proposal_id === p.id)
        .map((v) => ({
          studentId: v.student_id,
          studentName: v.student_name,
          vote: v.vote as "endorse" | "object",
          comment: v.comment,
          createdAt: String(v.created_at ?? ""),
        })),
    }));

    const work = venture
      ? await loadVentureWork(venture.id, activeMembers.length, quorumPct)
      : emptyWork();
    const life = await loadCourseLife({
      studentId: student.id,
      authUserId: context.userId,
      groupId: group.id,
      offeringId: offering?.id ?? null,
    });

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
      isStaff: false,
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
      proposals,
      work,
      life,
      canOpenSelection,
      canRecordGroupDecision,
      aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    };
  });

export const listOfferings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<CourseOffering[]> => {
    const sql = await getSql();
    const rows = await sql.query<OfferingRow>(
      `select ${OFFERING_COLUMNS}
       from course_offerings o
       join courses c on c.id = o.course_id
       order by o.academic_year desc`,
    );
    return rows.map(mapOffering);
  });
