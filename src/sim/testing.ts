// Small builders shared by the engine's tests. Not used by production code.
import { PeriodContext } from "./context.ts";
import { initialState } from "./engine.ts";
import { Rng } from "./rng.ts";
import { campusFoodStall } from "./scenarios/campus-food-stall.ts";
import type { Decisions, PeriodInput, Scenario, SimState } from "./types.ts";
import { CURRENT_ENGINE_VERSION } from "./versions.ts";

export const scenario = campusFoodStall;

export function ctxFor(opts: { period?: number; cash?: number; seed?: string; scenario?: Scenario } = {}): PeriodContext {
  return new PeriodContext(opts.scenario ?? scenario, opts.period ?? 1, new Rng(opts.seed ?? "test"), opts.cash ?? 100000);
}

export function decisionsFor(period: number, overrides: Partial<Decisions> = {}): Decisions {
  return {
    period,
    products: {
      rice_pack: { price: 2500, qualityTier: "standard", order: { supplierId: "market_trader", units: 200 } },
    },
    marketingBudget: 10000,
    eventResponses: {},
    ...overrides,
  };
}

export function inputFor(state: SimState, overrides: Partial<PeriodInput> = {}): PeriodInput {
  return {
    engineVersion: CURRENT_ENGINE_VERSION,
    scenario,
    state,
    decisions: decisionsFor(state.period + 1),
    cohortEvents: [],
    seed: `test:${state.period + 1}`,
    financing: [],
    ...overrides,
  };
}

export function freshState(simulationId = "sim-test"): SimState {
  return initialState(scenario, simulationId);
}
