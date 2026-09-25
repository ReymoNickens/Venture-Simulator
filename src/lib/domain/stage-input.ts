import { computeFinance, parseFinanceInputs } from "./finance";
import { CANVAS_BLOCKS, stageProgress, type StageInput, type StageProgress } from "./stages";
import type { WorkspaceSnapshot } from "./types";

/** Derive the route's progress inputs from a workspace snapshot. */
export function stageInputFromSnapshot(data: WorkspaceSnapshot): StageInput {
  const active = data.members.filter((m) => m.membershipStatus === "active");
  const me = data.student?.id;
  const w = data.work;
  const interviewers = new Set(w.interviews.map((i) => i.studentId));
  const interviewEvidence = new Set(w.interviews.map((i) => i.evidenceItemId).filter(Boolean) as string[]);
  const liveCanvas = w.canvas.filter((c) => c.status === "active");
  const filledBlocks = new Set(liveCanvas.map((c) => c.block));
  const evidencedBlocks = new Set(liveCanvas.filter((c) => c.evidenceIds.length).map((c) => c.block));
  const finance = w.finance ? computeFinance(parseFinanceInputs(w.finance.inputs)) : null;
  const financeInputs = w.finance ? parseFinanceInputs(w.finance.inputs) : null;
  const peers = active.filter((m) => m.studentId !== me && !m.isSynthetic);
  const rated = new Set(data.life.myPeerRatings.map((r) => r.rateeStudentId));

  return {
    inGroup: Boolean(data.group),
    activeMembers: active.length,
    mySubmitted: Boolean(data.myOpportunity && data.myOpportunity.status !== "draft"),
    submittedCount: data.submissionProgress.submitted,
    myPreference: Boolean(data.myPreference),
    hasVenture: Boolean(data.venture),
    assumptions: data.assumptions.length,
    criticalAssumptions: data.assumptions.filter((a) => a.importance === "critical").length,
    evidence: data.evidence.length,
    linkedAssumptions: new Set(data.links.map((l) => l.assumptionId)).size,
    interviews: w.interviews.length,
    // Demonstration peers cannot interview anyone; don't wait on them.
    interviewersMissing: active
      .filter((m) => !m.isSynthetic && !interviewers.has(m.studentId))
      .map((m) => m.fullName.split(" ")[0]),
    interviewsPerMember: data.life.interviewsPerMember,
    interviewLinkedToAssumption: data.links.some((l) => interviewEvidence.has(l.evidenceItemId)),
    canvasBlocksFilled: CANVAS_BLOCKS.filter((b) => filledBlocks.has(b.key)).length,
    canvasBlocksEvidenced: CANVAS_BLOCKS.filter((b) => evidencedBlocks.has(b.key)).length,
    feasibilityLenses: w.feasibility.length,
    feasibilityLensesEvidenced: w.feasibility.filter((f) => f.evidenceIds.length > 0).length,
    hasFinanceModel: Boolean(finance),
    financePriceEvidenced: Boolean(financeInputs?.priceEvidenceId),
    financeCostsSourcedShare: finance?.sourcedShare ?? 0,
    financeBreakEven: finance?.breakEvenUnits !== null && finance?.breakEvenUnits !== undefined,
    prototypes: w.prototypes.length,
    prototypeTests: w.prototypeTests.length,
    minPrototypeTests: data.life.minPrototypeTests,
    decisionRatified: w.decisions.some((d) => d.status === "ratified"),
    myDecideReflection: data.life.myReflections.some((r) => r.stage === "decide"),
    myPeerRatingsDone: peers.length === 0 || peers.every((p) => rated.has(p.studentId)),
    planSectionsWritten: w.plan.map((p) => p.section),
  };
}

export function progressFromSnapshot(data: WorkspaceSnapshot): StageProgress[] {
  return stageProgress(stageInputFromSnapshot(data));
}
