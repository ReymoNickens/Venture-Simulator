import type { GroupStatus, OpportunityStatus } from "./types";

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

export function evaluateGroupStatus(input: {
  activeMemberCount: number;
  submittedCount: number;
  requiresAllActive: boolean;
  hasVenture: boolean;
  current: GroupStatus;
}): GroupStatus {
  if (input.hasVenture || input.current === "venture_created") {
    return "venture_created";
  }
  if (input.current === "selection") return "selection";
  if (input.activeMemberCount <= 1) return "forming";
  const ready =
    input.activeMemberCount > 0 &&
    input.submittedCount >= input.activeMemberCount &&
    (input.requiresAllActive || input.submittedCount > 0);
  if (ready) return "selection_ready";
  return "opportunity_collection";
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

export type JourneyId =
  | "group"
  | "opportunity"
  | "submit"
  | "select"
  | "evidence"
  | "assumptions";

export function journeyState(input: {
  hasGroup: boolean;
  hasDraftOrOpportunity: boolean;
  hasSubmitted: boolean;
  groupStatus: GroupStatus | null;
  hasVenture: boolean;
  evidenceCount: number;
  assumptionCount: number;
}): Record<JourneyId, "done" | "current" | "todo"> {
  const selectOpen =
    input.groupStatus === "selection_ready" ||
    input.groupStatus === "selection" ||
    input.groupStatus === "venture_created";
  const result: Record<JourneyId, "done" | "current" | "todo"> = {
    group: input.hasGroup ? "done" : "current",
    opportunity: "todo",
    submit: "todo",
    select: "todo",
    evidence: "todo",
    assumptions: "todo",
  };
  if (!input.hasGroup) return result;
  result.opportunity = input.hasDraftOrOpportunity ? "done" : "current";
  if (!input.hasDraftOrOpportunity) return result;
  result.submit = input.hasSubmitted ? "done" : "current";
  if (!input.hasSubmitted) return result;
  result.select = input.hasVenture ? "done" : selectOpen ? "current" : "todo";
  if (!input.hasVenture) return result;
  result.evidence = input.evidenceCount > 0 ? "done" : "current";
  result.assumptions =
    input.assumptionCount > 0 ? "done" : input.evidenceCount > 0 ? "current" : "todo";
  return result;
}
