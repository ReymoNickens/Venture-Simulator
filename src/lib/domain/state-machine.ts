import type {
  AssumptionStatus,
  Confidence,
  DecisionRule,
  ExperimentResult,
  GroupStatus,
  OpportunityStatus,
} from "./types";

const ORDER: GroupStatus[] = [
  "forming",
  "opportunity_collection",
  "selection_ready",
  "selection",
  "venture_created",
];

export function groupStatusIndex(status: GroupStatus): number {
  return ORDER.indexOf(status);
}

export function canViewPeerOpportunities(status: GroupStatus): boolean {
  return (
    status === "selection_ready" ||
    status === "selection" ||
    status === "venture_created"
  );
}

export function nextCollectionStatus(memberCount: number): GroupStatus {
  return memberCount <= 1 ? "forming" : "opportunity_collection";
}

/**
 * When may peers' opportunities be compared?
 * - requiresAllActive (default): every active member has submitted.
 * - otherwise: at least half the group (and at least two people) have submitted.
 * - a lecturer may open selection early for a group whose missing members are not
 *   coming, as long as there are at least two ideas to compare.
 */
export function evaluateGroupStatus(input: {
  activeMemberCount: number;
  submittedCount: number;
  requiresAllActive: boolean;
  hasVenture: boolean;
  current: GroupStatus;
  lecturerOpened?: boolean;
}): GroupStatus {
  if (input.hasVenture || input.current === "venture_created") return "venture_created";
  if (input.current === "selection") return "selection";
  if (input.lecturerOpened && input.submittedCount >= 2) return "selection_ready";
  if (input.activeMemberCount <= 1) return "forming";
  const threshold = input.requiresAllActive
    ? input.activeMemberCount
    : Math.max(2, Math.ceil(input.activeMemberCount / 2));
  if (input.submittedCount >= threshold) return "selection_ready";
  return "opportunity_collection";
}

/** New members may only join before anyone has seen anyone else's idea. */
export function canJoinGroup(status: GroupStatus): boolean {
  return status === "forming" || status === "opportunity_collection";
}

/**
 * A draft is always editable until the venture exists. A submitted idea may be
 * revised only while ideas are still private; once peers can see each other's
 * work, it is locked so nobody rewrites theirs after reading the others.
 */
export function canEditOpportunity(status: OpportunityStatus, groupStatus: GroupStatus): boolean {
  if (groupStatus === "venture_created") return false;
  if (status === "draft") return true;
  if (status === "submitted") return !canViewPeerOpportunities(groupStatus);
  return false;
}

export function opportunityVisibleToPeer(
  status: OpportunityStatus,
  groupStatus: GroupStatus,
  isOwner: boolean,
): boolean {
  if (isOwner) return true;
  if (status === "draft") return false;
  return canViewPeerOpportunities(groupStatus);
}

/**
 * Preferences are sealed: nobody sees anyone else's choice (or reason) until every
 * required voter has recorded theirs, so later voters can't anchor on earlier ones.
 */
export function preferencesRevealed(recorded: number, required: number): boolean {
  return required > 0 && recorded >= required;
}

/** Who must vote and endorse: active members, or — if a lecturer opened selection early — those who submitted. */
export function eligibleVoterIds(input: {
  activeMemberIds: string[];
  submittedMemberIds: string[];
  lecturerOpened: boolean;
}): string[] {
  if (!input.lecturerOpened) return input.activeMemberIds;
  const submitted = new Set(input.submittedMemberIds);
  return input.activeMemberIds.filter((id) => submitted.has(id));
}

/** Endorsements needed for a proposal to become the group's decision. */
export function endorsementsNeeded(eligible: number, rule: DecisionRule): number {
  if (eligible <= 0) return 1;
  return rule === "all" ? eligible : Math.floor(eligible / 2) + 1;
}

/** A proposal passes at the threshold, and fails as soon as passing is impossible. */
export function proposalOutcome(input: {
  endorse: number;
  object: number;
  eligible: number;
  rule: DecisionRule;
}): "open" | "accepted" | "rejected" {
  const needed = endorsementsNeeded(input.eligible, input.rule);
  if (input.endorse >= needed) return "accepted";
  if (input.eligible - input.object < needed) return "rejected";
  return "open";
}

/** What a finished experiment does to the assumption it tested. */
export function assumptionAfterExperiment(
  result: ExperimentResult,
  current: { status: AssumptionStatus; confidence: Confidence },
  confidenceAfter: Confidence | null,
): { status: AssumptionStatus; confidence: Confidence } {
  const status: AssumptionStatus =
    result === "supports" ? "supported" : result === "challenges" ? "challenged" : "testing";
  return { status, confidence: confidenceAfter ?? current.confidence };
}

/** Riskiest first: importance high → low, then confidence low → high. */
export function riskScore(a: { importance: string; confidence: string }): number {
  const imp = ({ critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>)[a.importance] ?? 1;
  const conf = ({ low: 3, medium: 2, high: 1 } as Record<string, number>)[a.confidence] ?? 2;
  return imp * conf;
}

export function advisorAllowance(usedToday: number, perDay: number): { allowed: boolean; left: number } {
  const left = Math.max(0, perDay - usedToday);
  return { allowed: left > 0, left };
}

export type JourneyId = "team" | "idea" | "decide" | "evidence" | "assumptions" | "test";

export function journeyState(input: {
  hasGroup: boolean;
  hasDraftOrOpportunity: boolean;
  hasSubmitted: boolean;
  groupStatus: GroupStatus | null;
  hasVenture: boolean;
  evidenceCount: number;
  assumptionCount: number;
  experimentsDone?: number;
}): Record<JourneyId, "done" | "current" | "todo"> {
  const selectOpen = input.groupStatus ? canViewPeerOpportunities(input.groupStatus) : false;
  const result: Record<JourneyId, "done" | "current" | "todo"> = {
    team: input.hasGroup ? "done" : "current",
    idea: "todo",
    decide: "todo",
    evidence: "todo",
    assumptions: "todo",
    test: "todo",
  };
  if (!input.hasGroup) return result;
  result.idea = input.hasSubmitted ? "done" : "current";
  if (!input.hasSubmitted) return result;
  result.decide = input.hasVenture ? "done" : selectOpen ? "current" : "todo";
  if (!input.hasVenture) return result;
  result.evidence = input.evidenceCount > 0 ? "done" : "current";
  result.assumptions = input.assumptionCount > 0 ? "done" : input.evidenceCount > 0 ? "current" : "todo";
  result.test = (input.experimentsDone ?? 0) > 0 ? "done" : input.assumptionCount > 0 ? "current" : "todo";
  return result;
}
