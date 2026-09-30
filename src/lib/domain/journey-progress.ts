import { JOURNEY_STEPS } from "./config";
import { journeyState, type JourneyId } from "./state-machine";
import type { WorkspaceSnapshot } from "./types";

export type JourneyProgress = {
  states: Record<JourneyId, "done" | "current" | "todo">;
  /** The first step still in progress, or the last step once everything is done. */
  current: (typeof JOURNEY_STEPS)[number];
  /** 1-based position of `current`. */
  stop: number;
  total: number;
  doneCount: number;
};

export function journeyFromSnapshot(data: WorkspaceSnapshot): JourneyProgress {
  const states = journeyState({
    hasGroup: Boolean(data.group),
    hasDraftOrOpportunity: Boolean(data.myOpportunity),
    hasSubmitted: data.myOpportunity?.status !== "draft" && Boolean(data.myOpportunity),
    groupStatus: data.group?.status ?? null,
    hasVenture: Boolean(data.venture),
    evidenceCount: data.evidence.length,
    assumptionCount: data.assumptions.length,
    simulation: data.simulation,
  });
  const idx = JOURNEY_STEPS.findIndex((s) => states[s.id] !== "done");
  const at = idx === -1 ? JOURNEY_STEPS.length - 1 : idx;
  return {
    states,
    current: JOURNEY_STEPS[at],
    stop: at + 1,
    total: JOURNEY_STEPS.length,
    doneCount: JOURNEY_STEPS.filter((s) => states[s.id] === "done").length,
  };
}

