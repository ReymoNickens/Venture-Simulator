// Competitors: their share of the market this period, and how they react to
// the student venture for next period. Reactions are deterministic rules so a
// lecturer can always say why a competitor did what it did.
import type { PeriodContext } from "../context.ts";
import { clamp, round4 } from "../canonical.ts";
import { formatGhs, toPesewas } from "../money.ts";
import type { CompetitorState, SegmentDef } from "../types.ts";
import { choiceWeight, utility } from "./demand.ts";
import type { Modifiers } from "./events.ts";

export function effectivePrice(c: CompetitorState, m: Modifiers): number {
  return toPesewas(c.price * m.competitorPrice);
}

/** Choice weight of a competitor's offer for a segment (before awareness). */
export function competitorWeight(
  c: CompetitorState,
  segment: SegmentDef,
  referencePrice: number,
  m: Modifiers,
): number {
  const u = utility(effectivePrice(c, m), referencePrice, c.quality, c.reputation, {
    priceSensitivity: segment.priceSensitivity.value,
    qualitySensitivity: segment.qualitySensitivity.value,
    brandSensitivity: segment.brandSensitivity.value,
  });
  // Customers doubt a seller who ran out last period.
  return choiceWeight(u) * (c.stockedOut ? 0.8 : 1);
}

/**
 * Competitors serve the rest of the category's demand, in proportion to
 * attractiveness × how well known they are, up to their capacity.
 */
export function competitorSales(
  ctx: PeriodContext,
  competitors: CompetitorState[],
  residualBySegment: { segment: SegmentDef; residual: number; referencePrice: number }[],
  m: Modifiers,
): { id: string; demand: number; sold: number; stockedOut: boolean }[] {
  const active = competitors.filter((c) => c.active);
  const demand = new Map<string, number>(active.map((c) => [c.id, 0]));
  for (const { segment, residual, referencePrice } of residualBySegment) {
    const weights = active.map((c) => competitorWeight(c, segment, referencePrice, m) * c.marketingStrength);
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) continue;
    active.forEach((c, i) => demand.set(c.id, demand.get(c.id)! + (residual * weights[i]) / total));
  }
  return active.map((c) => {
    const d = Math.round(demand.get(c.id)!);
    const sold = Math.min(d, c.capacityUnits);
    const stockedOut = d > c.capacityUnits;
    ctx.explain(
      "competition",
      "competitor_sales",
      sold,
      `${c.name} sold about ${sold} units at ${formatGhs(effectivePrice(c, m))}${stockedOut ? ` and ran out (customers wanted ${d}, capacity ${c.capacityUnits})` : ""}.`,
      { params: [`competitors[${c.id}].capacityUnits`, `competitors[${c.id}].marketingStrength`], events: m.sources.competitor_price ?? [] },
    );
    return { id: c.id, demand: d, sold, stockedOut };
  });
}

/** Competitor behaviour for NEXT period, reacting to what the venture did. */
export function reactCompetitors(
  ctx: PeriodContext,
  competitors: CompetitorState[],
  sales: { id: string; sold: number; stockedOut: boolean }[],
  ours: { avgPrice: number; share: number; prevShare: number },
  newEntrants: string[],
): CompetitorState[] {
  return competitors.map((c) => {
    const next: CompetitorState = { ...c };
    if (!c.active) {
      if (newEntrants.includes(c.id)) {
        next.active = true;
        ctx.explain("competition", "competitor_enters", c.id, `${c.name} opened nearby and will compete from next period.`, {
          params: [`competitors[${c.id}]`],
        });
      }
      return next;
    }
    const sale = sales.find((s) => s.id === c.id);
    next.lastUnitsSold = sale?.sold ?? 0;
    next.stockedOut = sale?.stockedOut ?? false;
    const floor = toPesewas(c.unitCost * 1.1);
    const undercut = ours.avgPrice > 0 && ours.avgPrice < c.price * 0.95 && ours.share >= 0.1;
    let action = "";
    switch (c.strategy) {
      case "price_matcher":
        if (undercut) {
          next.price = Math.max(floor, toPesewas(c.price - (c.price - ours.avgPrice) * 0.5));
          action = `cut its price to ${formatGhs(next.price)} to close half the gap to yours`;
        }
        break;
      case "marketer":
        if (ours.share - ours.prevShare > 0.03) {
          next.marketingStrength = round4(clamp(c.marketingStrength + 0.1, 0, 1));
          action = "stepped up its marketing because you are winning customers";
        }
        break;
      case "aggressive":
        if (ours.share > 0.2) {
          next.price = Math.max(floor, toPesewas(c.price * 0.9));
          next.marketingStrength = round4(clamp(c.marketingStrength + 0.05, 0, 1));
          action = `cut its price 10% to ${formatGhs(next.price)} and pushed marketing`;
        }
        break;
      case "steady":
        break;
    }
    if (!action && next.price !== c.basePrice) {
      // No pressure: drift a third of the way back to its normal price.
      next.price = toPesewas(c.price + (c.basePrice - c.price) / 3);
      action = `moved its price back towards normal (${formatGhs(next.price)})`;
    }
    if (action) {
      ctx.explain(
        "competition",
        "competitor_reaction",
        c.id,
        `${c.name} (${c.strategy.replace("_", " ")}) ${action}.`,
        { params: [`competitors[${c.id}].responseStrategy`] },
      );
    }
    return next;
  });
}
