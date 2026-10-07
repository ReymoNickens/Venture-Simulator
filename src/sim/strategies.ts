// Reference decision policies for tests, the CLI and lecturer demos. They
// are NOT advice to students: "careful" and "careless" exist to prove the
// engine rewards and punishes the behaviour the course is about.
import type { Decisions, PeriodOutput, Scenario, SimState } from "./types.ts";

export interface StrategyContext {
  scenario: Scenario;
  state: SimState;
  period: number;
  last: PeriodOutput | null;
}

export type Strategy = (ctx: StrategyContext) => Decisions;

function awaitingResponse(ctx: StrategyContext): string[] {
  return ctx.state.activeEvents.filter((e) => e.response === null).map((e) => e.instanceId);
}

/** Prices near the reference, orders close to recent demand, modest marketing. */
export const careful: Strategy = (ctx) => {
  const { scenario, state, last } = ctx;
  const products: Decisions["products"] = {};
  const preferred: Record<string, string> = {
    supplier_price_rise: "negotiate_bulk",
    momo_outage: "cash_only",
    power_outage: "charcoal",
    exam_period: "accept",
    competitor_price_cut: "loyalty_card",
    new_entrant: "ignore",
    transport_cost_rise: "share_transport",
    health_inspection: "comply",
    viral_post: "carry_on",
    storage_failure: "improvise",
  };
  for (const p of scenario.products) {
    const lastDemand = last
      ? last.outcomes.segments.filter((s) => s.productId === p.id).reduce((a, s) => a + s.demandUnits, 0)
      : 180;
    const onHand = state.inventory[p.id]?.units ?? 0;
    const target = Math.round(lastDemand * 1.1);
    products[p.id] = {
      price: p.referencePrice.value,
      qualityTier: p.defaultQualityTier,
      order: { supplierId: scenario.suppliers[0].id, units: Math.max(0, target - onHand) },
    };
  }
  const eventResponses: Record<string, string> = {};
  for (const id of awaitingResponse(ctx)) {
    const eventId = id.split("@")[0];
    const offered = scenario.events.find((e) => e.id === eventId)?.responses.some((r) => r.id === preferred[eventId]);
    if (preferred[eventId] && offered) eventResponses[id] = preferred[eventId];
  }
  return { period: ctx.period, products, marketingBudget: 15000, eventResponses };
};

/**
 * Prices below cost to "win the market", orders the same large batch every
 * period whatever sold, spends heavily on marketing, ignores events.
 */
export const careless: Strategy = (ctx) => {
  const { scenario } = ctx;
  const products: Decisions["products"] = {};
  for (const p of scenario.products) {
    products[p.id] = {
      price: Math.round(p.referencePrice.value * 0.5),
      qualityTier: p.defaultQualityTier,
      order: { supplierId: scenario.suppliers[0].id, units: 120 },
    };
  }
  return { period: ctx.period, products, marketingBudget: 40000, eventResponses: {} };
};

export const STRATEGIES: Record<string, Strategy> = { careful, careless };
