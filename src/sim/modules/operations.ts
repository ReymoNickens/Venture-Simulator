// Operations: supplier deliveries, stock (weighted-average cost), capacity
// and spoilage. Stock never goes negative unless the scenario enables
// backorders (not supported in engine v1, so it never goes negative).
import { floorUnits } from "../canonical.ts";
import { EngineInputError, type PeriodContext } from "../context.ts";
import { formatGhs, toPesewas } from "../money.ts";
import type { Modifiers } from "./events.ts";
import type { Decisions, InventoryState, PipelineItem, Scenario } from "../types.ts";

export interface InventoryFlow {
  opening: number;
  purchased: number;
  sold: number;
  spoiled: number;
  closing: number;
}

export function supplierUnitCost(
  scenario: Scenario,
  supplierId: string,
  productId: string,
  qualityTierId: string,
  m: Modifiers,
): number {
  const supplier = scenario.suppliers.find((s) => s.id === supplierId);
  if (!supplier) throw new EngineInputError(`Unknown supplier "${supplierId}"`);
  const price = supplier.unitPrice[productId];
  if (!price) throw new EngineInputError(`${supplier.name} does not supply "${productId}"`);
  const tier = scenario.qualityTiers.find((t) => t.id === qualityTierId);
  if (!tier) throw new EngineInputError(`Unknown quality tier "${qualityTierId}"`);
  return toPesewas(price.value * tier.unitCostMult.value * m.supplierCost);
}

/** Receive what arrives this period (pay on delivery). */
export function receiveDeliveries(
  ctx: PeriodContext,
  inventory: Record<string, InventoryState>,
  pipeline: PipelineItem[],
  flows: Record<string, InventoryFlow>,
): PipelineItem[] {
  const remaining: PipelineItem[] = [];
  for (const item of pipeline) {
    if (item.arrivesPeriod !== ctx.period) {
      remaining.push(item);
      continue;
    }
    const supplier = ctx.scenario.suppliers.find((s) => s.id === item.supplierId);
    if (!supplier) throw new EngineInputError(`Unknown supplier "${item.supplierId}"`);
    const { hit, draw } = ctx.rng
      .stream(`supplier:${item.supplierId}:${item.productId}`)
      .chance(supplier.disruptionProbability.value);
    const delivered = hit ? floorUnits(item.units * supplier.reliability.value) : item.units;
    const cost = delivered * item.unitCost;
    const inv = inventory[item.productId];
    inv.units += delivered;
    inv.value += cost;
    flows[item.productId].purchased += delivered;
    const lineId = ctx.explain(
      "operations",
      "delivery",
      delivered,
      hit
        ? `${supplier.name} could only deliver ${delivered} of ${item.units} units (a supply disruption). You paid for what arrived: ${delivered} × ${formatGhs(item.unitCost)} = ${formatGhs(cost)}.`
        : `${supplier.name} delivered all ${delivered} units: ${delivered} × ${formatGhs(item.unitCost)} = ${formatGhs(cost)}.`,
      {
        decisions: item.orderedPeriod === ctx.period ? [`products.${item.productId}.order`] : [],
        params: [
          `suppliers[${supplier.id}].disruptionProbability`,
          ...(hit ? [`suppliers[${supplier.id}].reliability`] : []),
        ],
        rng: [draw],
      },
    );
    ctx.post("inventory_purchase", -cost, `Stock from ${supplier.name}`, item.productId, lineId);
  }
  return remaining;
}

/**
 * Place this period's orders. An order due now is capped by supplier
 * capacity, the scenario's order limit and what the venture can pay for
 * today. An order with lead time arrives (and is paid for) next period.
 */
export function placeOrders(
  ctx: PeriodContext,
  decisions: Decisions,
  m: Modifiers,
): PipelineItem[] {
  const orders: PipelineItem[] = [];
  let committedCash = 0;
  for (const product of ctx.scenario.products) {
    const d = decisions.products[product.id];
    if (!d?.order || d.order.units <= 0) continue;
    const supplier = ctx.scenario.suppliers.find((s) => s.id === d.order!.supplierId);
    if (!supplier) throw new EngineInputError(`Unknown supplier "${d.order.supplierId}"`);
    const unitCost = supplierUnitCost(ctx.scenario, supplier.id, product.id, d.qualityTier, m);
    const requested = d.order.units;
    const capLimit = Math.min(supplier.capacityUnits.value, ctx.scenario.operations.maxOrderUnits.value);
    let units = Math.min(requested, capLimit);
    const leadTime = supplier.leadTimePeriods.value;
    const notes: string[] = [];
    if (units < requested) notes.push(`${supplier.name} can supply at most ${capLimit} per order`);
    if (leadTime === 0) {
      const affordable = Math.max(0, floorUnits((ctx.cash - committedCash) / unitCost));
      if (units > affordable) {
        notes.push(`you only had cash for ${affordable}`);
        units = affordable;
      }
      committedCash += units * unitCost;
    }
    ctx.explain(
      "operations",
      "order",
      units,
      `Ordered ${units} ${product.unit}s of ${product.name} from ${supplier.name} at ${formatGhs(unitCost)} each${notes.length ? ` (you asked for ${requested}; ${notes.join("; ")})` : ""}. ${leadTime === 0 ? "Delivered this period." : `Arrives in period ${ctx.period + leadTime}, paid on delivery.`}`,
      {
        decisions: [`products.${product.id}.order`, `products.${product.id}.qualityTier`],
        params: [
          `suppliers[${supplier.id}].unitPrice.${product.id}`,
          `qualityTiers[${d.qualityTier}].unitCostMult`,
          `suppliers[${supplier.id}].capacityUnits`,
          ...(m.sources.supplier_cost ?? []).map((s) => `event:${s}`),
        ],
        events: m.sources.supplier_cost ?? [],
      },
    );
    if (units > 0) {
      orders.push({
        productId: product.id,
        supplierId: supplier.id,
        units,
        unitCost,
        orderedPeriod: ctx.period,
        arrivesPeriod: ctx.period + leadTime,
      });
    }
  }
  return orders;
}

export function capacityUnits(ctx: PeriodContext, m: Modifiers): number {
  const base = ctx.scenario.operations.capacityUnitsPerPeriod.value;
  const units = floorUnits(base * m.capacity);
  ctx.explain(
    "operations",
    "capacity",
    units,
    m.capacity === 1
      ? `You can prepare and serve at most ${units} units this period (labour and equipment).`
      : `Capacity this period is ${units} units: normally ${base}, reduced to ×${m.capacity} by events.`,
    { params: ["operations.capacityUnitsPerPeriod"], events: m.sources.capacity ?? [] },
  );
  return units;
}

/** Remove sold units at weighted-average cost; returns cost of goods sold. */
export function sellFromStock(inv: InventoryState, units: number): number {
  if (units > inv.units) throw new Error(`Cannot sell ${units}; only ${inv.units} in stock`);
  if (units === 0) return 0;
  const cogs = units === inv.units ? inv.value : toPesewas((inv.value * units) / inv.units);
  inv.units -= units;
  inv.value -= cogs;
  return cogs;
}

/** Perishable stock: a share of what is left over is lost. */
export function spoil(
  ctx: PeriodContext,
  productId: string,
  inv: InventoryState,
  m: Modifiers,
): { units: number; value: number; lineId: string | null } {
  const rate = Math.min(1, ctx.scenario.operations.spoilageRate.value * m.spoilage);
  const units = floorUnits(inv.units * rate);
  if (units === 0) return { units: 0, value: 0, lineId: null };
  const value = sellFromStock(inv, units);
  const lineId = ctx.explain(
    "operations",
    "spoilage",
    units,
    `${units} unsold units spoiled (${Math.round(rate * 100)}% of leftover stock), a write-off of ${formatGhs(value)}.`,
    { params: ["operations.spoilageRate"], events: m.sources.spoilage ?? [] },
  );
  return { units, value, lineId };
}
