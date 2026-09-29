// The customer funnel for one product in one segment:
// marketing + footfall + referrals -> awareness -> leads -> conversions ->
// customers (retained + new) -> demand. Sales, stock-outs, complaints and
// churn from stock-outs are settled later, once stock and capacity are known.
import type { PeriodContext } from "../context.ts";
import { clamp } from "../canonical.ts";
import { formatGhs } from "../money.ts";
import type { CustomerState, SegmentDef } from "../types.ts";
import { conversionFactor, retentionFactor } from "./demand.ts";

export interface FunnelInput {
  productId: string;
  segment: SegmentDef;
  prev: CustomerState;
  reputation: number;
  marketingSpend: number;
  marketingEffectiveness: number;
  eventAwareness: number;
  attractiveness: number;
  switchingCostAdd: number;
  demandModifier: number;
  demandEvents: string[];
}

export interface FunnelResult {
  aware: number;
  leads: number;
  retained: number;
  churned: number;
  newCustomers: number;
  customers: number;
  referrals: number;
  demandUnits: number;
}

export function runFunnel(ctx: PeriodContext, f: FunnelInput): FunnelResult {
  const s = f.segment;
  const mk = ctx.scenario.marketing;
  const key = `${f.productId}:${s.id}`;
  const size = s.marketSize.value;

  // Awareness
  const reach = (f.marketingSpend / mk.costPerReach.value) * f.marketingEffectiveness;
  const referrals = Math.round(f.prev.active * mk.referralRate.value * (f.reputation / 100));
  const carried = f.prev.aware * (1 - mk.awarenessDecay.value);
  const aware = Math.min(
    size,
    Math.max(f.prev.active, Math.round(carried + s.footfallReach.value + reach + referrals + f.eventAwareness)),
  );
  const awareLine = ctx.explain(
    "customers",
    "awareness",
    aware,
    `${s.name}: ${aware} people aware of you = ${Math.round(carried)} still remembering you + ${s.footfallReach.value} passing by + ${Math.round(reach)} reached by ${formatGhs(f.marketingSpend)} of marketing + ${referrals} referred by customers${f.eventAwareness ? ` + ${Math.round(f.eventAwareness)} from events` : ""} (capped at the ${size} people in this segment).`,
    {
      decisions: f.marketingSpend > 0 ? ["marketingBudget", "marketingSplit"] : [],
      params: [
        `segments[${s.id}].footfallReach`,
        "marketing.costPerReach",
        "marketing.awarenessDecay",
        "marketing.referralRate",
        `segments[${s.id}].marketSize`,
      ],
    },
  );

  // Retention of last period's customers
  const switching = clamp(s.switchingCost.value + f.switchingCostAdd, 0, 1);
  const retainRate = s.retention.value * retentionFactor(f.attractiveness, switching);
  const retained = Math.round(f.prev.active * retainRate);
  const churned = f.prev.active - retained;

  // Leads and conversion
  const leads = Math.round(Math.max(0, aware - retained) * mk.leadRate.value);
  const convRate = clamp(s.conversionProbability.value * conversionFactor(f.attractiveness), 0, 0.95);
  const newCustomers = Math.round(leads * convRate);
  const customers = Math.min(aware, retained + newCustomers);
  const funnelLine = ctx.explain(
    "customers",
    "customers",
    customers,
    `${s.name}: ${customers} customers = ${retained} of last period's ${f.prev.active} who stayed (${Math.round(retainRate * 100)}% retention) + ${newCustomers} new (${leads} interested × ${Math.round(convRate * 100)}% conversion). Your offer is ${f.attractiveness >= 1 ? "at least as attractive as" : "less attractive than"} the average competitor (index ${f.attractiveness.toFixed(2)}).`,
    {
      decisions: [`products.${f.productId}.price`, `products.${f.productId}.qualityTier`],
      params: [`segments[${s.id}].retention`, `segments[${s.id}].conversionProbability`, "marketing.leadRate", `segments[${s.id}].switchingCost`],
      lines: [awareLine],
    },
  );

  // Demand, with this group's own customer-behaviour noise (ADR 0004)
  const sigma = ctx.scenario.noise.demandSigma.value;
  const noise = ctx.rng.stream(`demand:${key}`).noiseDraw(sigma);
  const noiseMult = clamp(1 + noise.value, 0.5, 1.5);
  const base = customers * s.purchaseFrequency.value;
  const demandUnits = Math.max(0, Math.round(base * f.demandModifier * noiseMult));
  ctx.explain(
    "customers",
    "demand",
    demandUnits,
    `${s.name}: customers wanted ${demandUnits} units = ${customers} customers × ${s.purchaseFrequency.value} each${f.demandModifier !== 1 ? ` × ${f.demandModifier.toFixed(2)} (events)` : ""} × ${noiseMult.toFixed(2)} (normal week-to-week variation in customer behaviour).`,
    {
      params: [`segments[${s.id}].purchaseFrequency`, "noise.demandSigma"],
      events: f.demandEvents,
      rng: [noise],
      lines: [funnelLine],
    },
  );

  return { aware, leads, retained, churned, newCustomers, customers, referrals, demandUnits };
}
