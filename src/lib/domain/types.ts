export type GroupStatus =
  | "forming"
  | "opportunity_collection"
  | "selection_ready"
  | "selection"
  | "venture_created";

export type MembershipStatus = "active" | "left";

export type OpportunityStatus = "draft" | "submitted" | "rejected" | "selected";

export type VentureStatus = "active" | "killed" | "pivoted";

export type EvidenceSourceType =
  | "interview"
  | "survey"
  | "observation"
  | "quotation"
  | "photo"
  | "other";

export type EvidenceClassification =
  | "fact"
  | "evidence"
  | "assumption"
  | "inference"
  | "opinion"
  | "unknown";

export type Importance = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type AssumptionStatus = "open" | "testing" | "supported" | "challenged";
export type RelationshipType = "supports" | "challenges";
export type DecisionRule = "majority" | "all";
export type ExperimentResult = "supports" | "challenges" | "inconclusive";
export type ExperimentMethod = "interviews" | "survey" | "observation" | "pre_sale" | "prototype_test" | "other";
export type ProposalStatus = "open" | "accepted" | "rejected" | "withdrawn";

export type AdvisorRole = "advisor" | "student";
export type AdvisorStage = "idea" | "selection" | "evidence";

export type ConnectionState =
  | "online"
  | "offline"
  | "saved_locally"
  | "syncing"
  | "synced"
  | "sync_error";

export type OutboxType =
  | "upsert_opportunity"
  | "submit_opportunity"
  | "create_evidence"
  | "create_assumption"
  | "link_assumption_evidence"
  | "create_experiment";

export interface Student {
  id: string;
  authUserId: string;
  fullName: string;
  indexNumber: string;
  programme: string;
  isSynthetic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  courseCode: string;
  courseName: string;
}

export interface CourseOffering {
  id: string;
  courseId: string;
  semester: string;
  academicYear: string;
  defaultGroupSize: number;
  selectionRequiresAllActive: boolean;
  maxPhotoBytes: number;
  decisionRule: DecisionRule;
  aiMessagesPerDay: number;
  courseCode: string;
  courseName: string;
}

export interface Group {
  id: string;
  courseOfferingId: string;
  groupName: string;
  groupNumber: number;
  joinCode: string;
  status: GroupStatus;
  createdByStudentId: string | null;
  capacity: number;
  selectionOpenedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  studentId: string;
  membershipStatus: MembershipStatus;
  joinedAt: string;
  fullName: string;
  isSynthetic: boolean;
  hasSubmittedOpportunity: boolean;
  hasRecordedPreference: boolean;
}

export interface Opportunity {
  id: string;
  studentId: string;
  groupId: string;
  problem: string;
  affectedPeople: string;
  context: string;
  observedEvidence: string;
  currentAlternatives: string;
  whyItMatters: string;
  possibleSolution: string;
  potentialCustomer: string;
  revenueMechanism: string;
  uncertainties: string;
  status: OpportunityStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  syncState?: "local" | "pending" | "synced" | "conflict";
}

export interface OpportunityPreference {
  id: string;
  opportunityId: string;
  studentId: string;
  preferenceRank: number;
  rationale: string;
  createdAt: string;
  studentName: string;
}

export interface Venture {
  id: string;
  groupId: string;
  opportunityId: string;
  name: string;
  status: VentureStatus;
  selectionRationale: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  ventureId: string;
  studentId: string;
  title: string;
  content: string;
  sourceType: EvidenceSourceType;
  classification: EvidenceClassification;
  /** Full photo: only present for items still waiting in this device's outbox. Fetch with getEvidencePhoto otherwise. */
  photoData: string | null;
  photoThumb: string | null;
  hasPhoto: boolean;
  photoMime: string | null;
  observedAt: string | null;
  locationContext: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  syncState?: "local" | "pending" | "synced" | "conflict";
}

export interface Assumption {
  id: string;
  ventureId: string;
  studentId: string;
  statement: string;
  importance: Importance;
  confidence: Confidence;
  status: AssumptionStatus;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  syncState?: "local" | "pending" | "synced";
}

export interface AssumptionEvidenceLink {
  id: string;
  assumptionId: string;
  evidenceItemId: string;
  relationshipType: RelationshipType;
  createdByStudentId: string;
  createdAt: string;
}

export interface AdvisorMessage {
  id: string;
  sessionId: string;
  ventureId: string | null;
  groupId: string;
  studentId: string | null;
  role: AdvisorRole;
  content: string;
  metadata: AdvisorMetadata | null;
  createdAt: string;
}

export interface AdvisorMetadata {
  challengeType?: string;
  requiresEvidence?: boolean;
  relatedAssumptionId?: string | null;
  suggestedNextAction?: string;
}

export interface AdvisorSession {
  id: string;
  ventureId: string | null;
  groupId: string;
  stage: AdvisorStage;
  createdAt: string;
  messages: AdvisorMessage[];
}

export interface ActivityEvent {
  id: string;
  studentId: string | null;
  groupId: string | null;
  ventureId: string | null;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

export interface VentureProposal {
  id: string;
  opportunityId: string;
  proposedByStudentId: string;
  proposedByName: string;
  name: string;
  rationale: string;
  status: ProposalStatus;
  createdAt: string;
  responses: { studentId: string; studentName: string; stance: "endorse" | "object"; comment: string }[];
  needed: number;
}

export interface Experiment {
  id: string;
  ventureId: string;
  assumptionId: string;
  studentId: string;
  authorName: string;
  hypothesis: string;
  method: ExperimentMethod;
  successCriteria: string;
  sampleTarget: number | null;
  status: "planned" | "done";
  result: ExperimentResult | null;
  learning: string | null;
  evidenceIds: string[];
  completedAt: string | null;
  createdAt: string;
}

export interface LecturerNote {
  id: string;
  groupId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface OpportunityFields {
  problem: string;
  affectedPeople: string;
  context: string;
  observedEvidence: string;
  currentAlternatives: string;
  whyItMatters: string;
  possibleSolution: string;
  potentialCustomer: string;
  revenueMechanism: string;
  uncertainties: string;
}

export interface WorkspaceSnapshot {
  appName: string;
  student: Student | null;
  offering: CourseOffering | null;
  group: Group | null;
  members: GroupMember[];
  myOpportunity: Opportunity | null;
  visibleOpportunities: Opportunity[];
  preferences: OpportunityPreference[];
  myPreference: OpportunityPreference | null;
  venture: Venture | null;
  evidence: EvidenceItem[];
  assumptions: Assumption[];
  links: AssumptionEvidenceLink[];
  advisorSessions: AdvisorSession[];
  activity: ActivityEvent[];
  submissionProgress: { submitted: number; required: number };
  preferenceProgress: { recorded: number; required: number };
  canOpenSelection: boolean;
  canRecordGroupDecision: boolean;
  aiAvailable: boolean;
  /** Whether my opportunity can still be edited (drafts; submitted ideas only while still private). */
  canEditMyOpportunity: boolean;
  /** Everyone's preferences are visible only once every voter has recorded one. */
  preferencesRevealed: boolean;
  eligibleVoterIds: string[];
  proposal: VentureProposal | null;
  pastProposals: VentureProposal[];
  experiments: Experiment[];
  notes: LecturerNote[];
  advisorLeftToday: number;
  isLecturer: boolean;
}
