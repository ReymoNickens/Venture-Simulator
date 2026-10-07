// Engine v1: runs one period of one venture. Pure: same input, same output,
// on any machine (ADR 0002, ADR 0003).
import { clamp, round4 } from "./canonical.ts";
import { cashBalance, EngineInputError, PeriodContext } from "./context.ts";
import { formatGhs, plural, toPesewas } from "./money.ts";
import { Rng } from "./rng.ts";
import { competitorSales, competitorWeight, reactCompetitors } from "./modules/competition.ts";
import { runFunnel, type FunnelResult } from "./modules/customers.ts";
import { choiceWeight, relativeAttractiveness, utility } from "./modules/demand.ts";
import { demandModifier, stepEvents } from "./modules/events.ts";
import {
  breakEven,
  cashFlow,
  explainFinance,
  profitAndLoss,
  runway,
} from "./modules/finance.ts";
import { disburse, repay } from "./modules/financing.ts";
import {
  capacityUnits,
  placeOrders,
  receiveDeliveries,
  sellFromStock,
  spoil,
  supplierUnitCost,
  type InventoryFlow,
} from "./modules/operations.ts";
import { learningSignals } from "./modules/signals.ts";
import type {
  CostLine,
  InventoryState,
  Outcomes,
  PeriodInput,
  PeriodOutput,
  SalesLine,
  Scenario,
  SegmentOutcome,
  SimState,
} from "./types.ts";

export const ENGINE_V1 = "1.0.0";

/** State before period 1: starting capital is the first ledger entry. */
export function initialState(scenario: Scenario, simulationId: string): SimState {
  const customers: SimState["customers"] = {};
  const inventory: SimState["inventory"] = {};
  for (const p of scenario.products) {
    inventory[p.id] = { units: 0, value: 0 };
    for (const s of scenario.segments) customers[`${p.id}:${s.id}`] = { aware: 0, active: 0 };
  }
  return {
    engineVersion: ENGINE_V1,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    simulationId,
    period: 0,
    status: "operating",
    ledger: [
      {
        id: "0:1",
        period: 0,
        category: "capital",
        amount: scenario.startingCapital.value,
        memo: "Starting capital",
        ref: "starting_capital",
        explainId: "p0.setup.1",
      },
    ],
    inventory,
    pipeline: [],
    customers,
    reputation: scenario.reputation.initial.value,
    competitors: scenario.competitors.map((c) => ({
      id: c.id,
      name: c.name,
      active: !c.entersViaEvent,
      basePrice: c.price.value,
      price: c.price.value,
      unitCost: c.unitCost.value,
      quality: c.quality.value,
      reputation: c.reputation.value,
      marketingStrength: c.marketingStrength.value,
      capacityUnits: c.capacityUnits.value,
      strategy: c.responseStrategy,
      lastUnitsSold: 0,
      lastShare: 0,
      stockedOut: false,
    })),
    debts: [],
    activeEvents: [],
    pastEventIds: [],
    history: [],
  };
}

function isWholeNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

export function validateInput(input: PeriodInput): void {
  const { scenario, state, decisions } = input;
  if (state.engineVersion !== input.engineVersion) {
    throw new EngineInputError(
      `This simulation was started with engine ${state.engineVersion}; it cannot be run with ${input.engineVersion}`,
    );
  }
  if (state.scenarioId !== scenario.id || state.scenarioVersion !== scenario.version) {
    throw new EngineInputError("The scenario does not match the one this simulation was started with");
  }
  if (state.status === "exited") throw new EngineInputError("This venture has exited");
  if (scenario.operations.backordersEnabled) {
    // Stock can never go negative in engine v1. A scenario that allows
    // backorders needs an engine version that models them.
    throw new EngineInputError(`Backorders are not supported by engine ${ENGINE_V1}`);
  }
  const period = state.period + 1;
  if (decisions.period !== period) {
    throw new EngineInputError(`Decisions are for period ${decisions.period}, but the next period is ${period}`);
  }
  if (period > scenario.periodCount.value) {
    throw new EngineInputError(`The simulation has only ${scenario.periodCount.value} periods`);
  }
  if (!input.seed) throw new EngineInputError("A seed is required");
  for (const p of scenario.products) {
    const d = decisions.products[p.id];
    if (!d) throw new EngineInputError(`Missing decisions for ${p.name}`);
    if (!isWholeNonNegative(d.price) || d.price === 0) {
      throw new EngineInputError(`${p.name}: price must be a positive whole number of pesewas`);
    }
    if (!scenario.qualityTiers.some((t) => t.id === d.qualityTier)) {
      throw new EngineInputError(`${p.name}: unknown quality tier "${d.qualityTier}"`);
    }
    if (d.order && !isWholeNonNegative(d.order.units)) {
      throw new EngineInputError(`${p.name}: order quantity must be a whole number`);
    }
  }
  for (const id of Object.keys(decisions.products)) {
    if (!scenario.products.some((p) => p.id === id)) throw new EngineInputError(`Unknown product "${id}"`);
  }
  if (!isWholeNonNegative(decisions.marketingBudget)) {
    throw new EngineInputError("Marketing budget must be a whole, non-negative number of pesewas");
  }
  for (const [segId, w] of Object.entries(decisions.marketingSplit ?? {})) {
    if (!scenario.segments.some((s) => s.id === segId)) throw new EngineInputError(`Unknown segment "${segId}"`);
    if (typeof w !== "number" || !(w >= 0)) throw new EngineInputError("Marketing split weights must be ≥ 0");
  }
}

/** Split `total` whole units across `weights` by largest remainder. */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

export function runPeriodV1(input: PeriodInput): PeriodOutput {
  validateInput(input);
  const { scenario, state, decisions } = input;
  const period = state.period + 1;
  const openingCash = cashBalance(state.ledger);
  const ctx = new PeriodContext(scenario, period, new Rng(input.seed), openingCash);

  // 1. Events and responses -> modifiers every other module applies.
  const ev = stepEvents(ctx, state, decisions, input.cohortEvents);
  const m = ev.modifiers;

  // 2. Approved financing arrives.
  let debts = disburse(ctx, state.debts, input.financing ?? []);

  // 3. Stock: last period's orders arrive, then this period's orders.
  const inventory: Record<string, InventoryState> = {};
  const flows: Record<string, InventoryFlow> = {};
  for (const p of scenario.products) {
    const inv = state.inventory[p.id] ?? { units: 0, value: 0 };
    inventory[p.id] = { ...inv };
    flows[p.id] = { opening: inv.units, purchased: 0, sold: 0, spoiled: 0, closing: 0 };
  }
  let pipeline = receiveDeliveries(ctx, inventory, state.pipeline, flows);
  const newOrders = placeOrders(ctx, decisions, m);
  pipeline = [...pipeline, ...receiveDeliveries(ctx, inventory, newOrders, flows)];

  // 4. Marketing: you cannot spend cash you do not have.
  const marketingSpend = Math.min(decisions.marketingBudget, Math.max(0, ctx.cash));
  const marketingLine = ctx.explain(
    "marketing",
    "marketing_spend",
    marketingSpend,
    marketingSpend < decisions.marketingBudget
      ? `You planned ${formatGhs(decisions.marketingBudget)} of marketing but only had ${formatGhs(marketingSpend)} left to spend.`
      : `Marketing spend: ${formatGhs(marketingSpend)}.`,
    { decisions: ["marketingBudget"] },
  );
  ctx.post("marketing", -marketingSpend, "Marketing", null, marketingLine);

  // 5. Capacity.
  const capacity = capacityUnits(ctx, m);

  // 6. Customer funnel and demand, per product and segment.
  const totalSize = scenario.segments.reduce((s, x) => s + x.marketSize.value, 0);
  const splitWeights = scenario.segments.map(
    (s) => decisions.marketingSplit?.[s.id] ?? s.marketSize.value,
  );
  const splitTotal = splitWeights.reduce((s, w) => s + w, 0);
  const funnels: { productId: string; segmentId: string; f: FunnelResult; quality: number }[] = [];
  for (const p of scenario.products) {
    const d = decisions.products[p.id];
    const tier = scenario.qualityTiers.find((t) => t.id === d.qualityTier)!;
    const quality = clamp(tier.quality.value + m.qualityAdd, 0, 1);
    scenario.segments.forEach((s, si) => {
      const ref = p.referencePrice.value * s.referencePriceMult.value;
      const taste = {
        priceSensitivity: s.priceSensitivity.value,
        qualitySensitivity: s.qualitySensitivity.value,
        brandSensitivity: s.brandSensitivity.value,
      };
      const ours = choiceWeight(utility(d.price, ref, quality, state.reputation, taste));
      const theirs = state.competitors
        .filter((c) => c.active)
        .map((c) => competitorWeight(c, s, ref, m));
      const r = relativeAttractiveness(ours, theirs);
      const spend = splitTotal > 0 ? (marketingSpend * splitWeights[si]) / splitTotal / scenario.products.length : 0;
      const f = runFunnel(ctx, {
        productId: p.id,
        segment: s,
        prev: state.customers[`${p.id}:${s.id}`] ?? { aware: 0, active: 0 },
        reputation: state.reputation,
        marketingSpend: spend,
        marketingEffectiveness: m.marketingEffectiveness,
        eventAwareness: (m.awarenessAdd * s.marketSize.value) / totalSize / scenario.products.length,
        attractiveness: r,
        switchingCostAdd: m.switchingCostAdd,
        demandModifier: demandModifier(m, s.id),
        demandEvents: [...(m.sources.demand ?? [])],
      });
      funnels.push({ productId: p.id, segmentId: s.id, f, quality });
    });
  }

  // 7. Sales: the smallest of demand, stock and capacity.
  const demandByProduct = scenario.products.map((p) =>
    funnels.filter((x) => x.productId === p.id).reduce((s, x) => s + x.f.demandUnits, 0),
  );
  const capacityShares = allocate(capacity, demandByProduct);
  const salesLines: SalesLine[] = [];
  const variableCostLines: CostLine[] = [];
  const soldBySegment = new Map<string, number>();
  const salesLineIds: string[] = [];
  scenario.products.forEach((p, pi) => {
    const d = decisions.products[p.id];
    const segs = funnels.filter((x) => x.productId === p.id);
    const demand = demandByProduct[pi];
    const inv = inventory[p.id];
    const sellable = Math.min(demand, inv.units, capacityShares[pi]);
    const limit =
      sellable === demand ? "you met all demand" : sellable === inv.units ? "limited by the stock you had" : "limited by capacity";
    const perSeg = allocate(sellable, segs.map((x) => x.f.demandUnits));
    const salesLine = ctx.explain(
      "operations",
      "units_sold",
      sellable,
      `${p.name}: sold ${sellable} of ${demand} wanted (${limit}; stock ${inv.units}, capacity ${capacityShares[pi]}).`,
      { decisions: [`products.${p.id}.order`] },
    );
    salesLineIds.push(salesLine);
    segs.forEach((x, i) => {
      const units = perSeg[i];
      soldBySegment.set(`${p.id}:${x.segmentId}`, units);
      if (units === 0) return;
      const amount = units * d.price;
      salesLines.push({ productId: p.id, segmentId: x.segmentId, units, price: d.price, amount });
      const lineId = ctx.explain(
        "finance",
        "revenue",
        amount,
        `Revenue from ${scenario.segments.find((s) => s.id === x.segmentId)!.name}: ${units} × ${formatGhs(d.price)} = ${formatGhs(amount)}.`,
        { decisions: [`products.${p.id}.price`], lines: [salesLine] },
      );
      ctx.post("revenue", amount, `Sales: ${p.name}`, `${p.id}:${x.segmentId}`, lineId);
    });
    flows[p.id].sold = sellable;
    const cogs = sellFromStock(inv, sellable);
    if (cogs > 0) {
      const lineId = ctx.explain(
        "finance",
        "cost_of_goods_sold",
        cogs,
        `Cost of the ${sellable} units sold: ${formatGhs(cogs)} (their purchase cost, already paid when bought).`,
        { lines: [salesLine] },
      );
      variableCostLines.push({ label: `Cost of ${p.name} sold`, amount: cogs, cash: false, explainId: lineId });
    }
    const perUnit = toPesewas(p.perUnitCost.value + m.perUnitCostAdd);
    const perUnitTotal = perUnit * sellable;
    if (perUnitTotal > 0) {
      const lineId = ctx.explain(
        "finance",
        "per_unit_costs",
        perUnitTotal,
        `Packaging and other per-unit costs: ${sellable} × ${formatGhs(perUnit)} = ${formatGhs(perUnitTotal)}.`,
        { params: [`products[${p.id}].perUnitCost`], events: m.sources.per_unit_cost ?? [], lines: [salesLine] },
      );
      ctx.post("variable_cost", -perUnitTotal, `Per-unit costs: ${p.name}`, p.id, lineId);
      variableCostLines.push({ label: `Per-unit costs: ${p.name}`, amount: perUnitTotal, cash: true, explainId: lineId });
    }
  });

  // 8. Customers who could not buy: some leave; complaints.
  const segments: SegmentOutcome[] = funnels.map(({ productId, segmentId, f, quality }) => {
    const sold = soldBySegment.get(`${productId}:${segmentId}`) ?? 0;
    const unmet = f.demandUnits - sold;
    const unmetShare = f.demandUnits > 0 ? unmet / f.demandUnits : 0;
    const lost = Math.round(f.customers * unmetShare * scenario.operations.stockoutChurn.value);
    const customers = f.customers - lost;
    const complaints = Math.round(
      f.customers * unmetShare * 0.5 +
        f.customers * scenario.operations.lowQualityComplaintRate.value * (1 - quality),
    );
    if (lost > 0) {
      ctx.explain(
        "customers",
        "stockout_churn",
        lost,
        `${scenario.segments.find((x) => x.id === segmentId)!.name}: ${plural(lost, "customer")} could not buy and will not come back next period.`,
        { params: ["operations.stockoutChurn"] },
      );
    }
    return {
      productId,
      segmentId,
      aware: f.aware,
      leads: f.leads,
      newCustomers: f.newCustomers,
      retained: f.retained,
      churned: f.churned + lost,
      customers,
      demandUnits: f.demandUnits,
      unitsSold: sold,
      unmetUnits: unmet,
      complaints,
      referrals: f.referrals,
    };
  });

  // 9. Spoilage of leftover stock.
  for (const p of scenario.products) {
    const s = spoil(ctx, p.id, inventory[p.id], m);
    flows[p.id].spoiled = s.units;
    flows[p.id].closing = inventory[p.id].units;
    if (s.value > 0 && s.lineId) {
      variableCostLines.push({ label: `Spoiled ${p.name}`, amount: s.value, cash: false, explainId: s.lineId });
    }
  }

  // 10. Fixed costs (rent, wages, utilities, event costs, marketing, event responses).
  const fixedCostLines: CostLine[] = [];
  for (const fc of scenario.fixedCosts) {
    const lineId = ctx.explain("finance", "fixed_cost", fc.amount.value, `${fc.label}: ${formatGhs(fc.amount.value)}.`, {
      params: [`fixedCosts[${fc.id}].amount`],
    });
    ctx.post("fixed_cost", -fc.amount.value, fc.label, fc.id, lineId);
    fixedCostLines.push({ label: fc.label, amount: fc.amount.value, cash: true, explainId: lineId });
  }
  const eventCost = toPesewas(m.fixedCostAdd);
  if (eventCost !== 0) {
    const lineId = ctx.explain(
      "finance",
      "event_costs",
      eventCost,
      `Extra running costs caused by events and your responses: ${formatGhs(eventCost)}.`,
      { events: m.sources.fixed_cost ?? [] },
    );
    ctx.post("fixed_cost", -eventCost, "Event-related running costs", null, lineId);
    fixedCostLines.push({ label: "Event-related running costs", amount: eventCost, cash: true, explainId: lineId });
  }
  if (marketingSpend > 0) {
    fixedCostLines.push({ label: "Marketing", amount: marketingSpend, cash: true, explainId: marketingLine });
  }
  for (const tx of ctx.transactions.filter((t) => t.category === "event_response")) {
    fixedCostLines.push({ label: tx.memo, amount: -tx.amount, cash: true, explainId: tx.explainId });
  }

  // 11. Loans: interest (a cost) and principal (not a cost, but cash out).
  const repaid = repay(ctx, debts);
  debts = repaid.debts;
  for (const tx of ctx.transactions.filter((t) => t.category === "loan_interest")) {
    fixedCostLines.push({ label: tx.memo, amount: -tx.amount, cash: true, explainId: tx.explainId });
  }

  // 12. Competition: competitors serve the demand you did not.
  const residual = scenario.segments.map((s) => {
    const category = s.marketSize.value * s.purchaseFrequency.value * demandModifier(m, s.id);
    const oursSold = segments.filter((x) => x.segmentId === s.id).reduce((a, x) => a + x.unitsSold, 0);
    const ref = scenario.products[0].referencePrice.value * s.referencePriceMult.value;
    return { segment: s, residual: Math.max(0, category - oursSold), referencePrice: ref };
  });
  const compSales = competitorSales(ctx, state.competitors, residual, m);
  const unitsSold = segments.reduce((a, x) => a + x.unitsSold, 0);
  const compSold = compSales.reduce((a, x) => a + x.sold, 0);
  const marketShare = round4(unitsSold + compSold > 0 ? unitsSold / (unitsSold + compSold) : 0);
  const revenueTotal = salesLines.reduce((a, l) => a + l.amount, 0);
  const avgPrice =
    unitsSold > 0
      ? Math.round(revenueTotal / unitsSold)
      : Math.round(
          scenario.products.reduce((a, p) => a + decisions.products[p.id].price, 0) / scenario.products.length,
        );
  const prevShare = state.history.length ? state.history[state.history.length - 1].marketShare : 0;
  const competitors = reactCompetitors(
    ctx,
    state.competitors,
    compSales,
    { avgPrice, share: marketShare, prevShare },
    m.newCompetitors,
  ).map((c) => {
    const s = compSales.find((x) => x.id === c.id);
    const total = unitsSold + compSold;
    return s ? { ...c, lastShare: round4(total > 0 ? s.sold / total : 0) } : c;
  });

  // 13. Reputation.
  const totalDemand = segments.reduce((a, x) => a + x.demandUnits, 0);
  const unmetUnits = segments.reduce((a, x) => a + x.unmetUnits, 0);
  const complaints = segments.reduce((a, x) => a + x.complaints, 0);
  const customersTotal = segments.reduce((a, x) => a + x.customers, 0);
  // Complaints are a symptom of quality and stock-outs, which are counted
  // directly below; they are reported, not counted a second time.
  const avgQuality = funnels.length ? funnels.reduce((a, x) => a + x.quality, 0) / funnels.length : 0.5;
  const qualityEffect = (avgQuality - 0.5) * 4;
  const stockoutEffect = totalDemand > 0 ? -(unmetUnits / totalDemand) * 6 : 0;
  const reputation = round4(
    clamp(state.reputation + qualityEffect + stockoutEffect + m.reputationAdd, 0, 100),
  );
  ctx.explain(
    "customers",
    "reputation",
    reputation,
    `Reputation moved from ${state.reputation.toFixed(1)} to ${reputation.toFixed(1)}: quality ${qualityEffect >= 0 ? "+" : ""}${qualityEffect.toFixed(1)}, customers turned away ${stockoutEffect.toFixed(1)}${m.reputationAdd ? `, events ${m.reputationAdd >= 0 ? "+" : ""}${m.reputationAdd}` : ""}.`,
    { decisions: scenario.products.map((p) => `products.${p.id}.qualityTier`), events: m.sources.reputation ?? [] },
  );

  // 14. Finance.
  const pnl = profitAndLoss(salesLines, variableCostLines, fixedCostLines);
  const cf = cashFlow(ctx.transactions);
  const closingCash = ctx.cash;
  if (closingCash !== openingCash + cf.netCashFlow) throw new Error("Ledger invariant broken");
  // Break-even uses the cost of supplying one unit (purchase + per-unit
  // costs). Spoilage stays in the P&L but is not a per-unit cost of a sale.
  const supplyCostOfSold = variableCostLines
    .filter((l) => !l.label.startsWith("Spoiled"))
    .reduce((a, l) => a + l.amount, 0);
  const perUnitVariable =
    unitsSold > 0
      ? Math.round(supplyCostOfSold / unitsSold)
      : Math.round(
          scenario.products.reduce((a, p) => {
            const d = decisions.products[p.id];
            const supplierId = d.order?.supplierId ?? scenario.suppliers[0].id;
            return a + supplierUnitCost(scenario, supplierId, p.id, d.qualityTier, m) + p.perUnitCost.value;
          }, 0) / scenario.products.length,
        );
  const be = breakEven(pnl.fixedCosts, avgPrice, perUnitVariable);
  const runwayPeriods = runway(closingCash, state.history, cf.operatingCashFlow);
  const status = closingCash < 0 ? "cash_out" : "operating";
  explainFinance(ctx, pnl, cf, openingCash, closingCash, salesLineIds);
  if (status === "cash_out") {
    ctx.explain(
      "finance",
      "cash_out",
      closingCash,
      `The venture could not pay everything it owed this period: it is ${formatGhs(-closingCash)} short. This is a cash-out.`,
    );
  }
  const inventoryValue = Object.values(inventory).reduce((a, i) => a + i.value, 0);
  const debtOutstanding = debts.reduce((a, d) => a + d.balance, 0);

  const customerState: SimState["customers"] = {};
  for (const s of segments) {
    customerState[`${s.productId}:${s.segmentId}`] = { aware: s.aware, active: s.customers };
  }

  const outcomes: Outcomes = {
    period,
    status,
    salesLines,
    revenue: pnl.revenue,
    variableCostLines,
    fixedCostLines,
    variableCosts: pnl.variableCosts,
    fixedCosts: pnl.fixedCosts,
    profit: pnl.profit,
    openingCash,
    closingCash,
    cashIn: cf.cashIn,
    cashOut: cf.cashOut,
    netCashFlow: cf.netCashFlow,
    operatingCashFlow: cf.operatingCashFlow,
    breakEvenUnits: be.units,
    breakEvenRevenue: be.revenue,
    runwayPeriods,
    unitsDemanded: totalDemand,
    unitsSold,
    unmetUnits,
    customers: customersTotal,
    newCustomers: segments.reduce((a, x) => a + x.newCustomers, 0),
    churned: segments.reduce((a, x) => a + x.churned, 0),
    complaints,
    referrals: segments.reduce((a, x) => a + x.referrals, 0),
    awareness: segments.reduce((a, x) => a + x.aware, 0),
    marketShare,
    reputation,
    inventory: flows,
    capacityUnits: capacity,
    incoming: pipeline.map((i) => ({
      productId: i.productId,
      supplierId: i.supplierId,
      units: i.units,
      arrivesPeriod: i.arrivesPeriod,
    })),
    debtOutstanding,
    assets: Math.max(0, closingCash) + inventoryValue,
    liabilities: debtOutstanding + Math.max(0, -closingCash),
    segments,
    competitors: compSales.map((c) => {
      const cs = state.competitors.find((x) => x.id === c.id)!;
      return {
        id: c.id,
        name: cs.name,
        price: toPesewas(cs.price * m.competitorPrice),
        unitsSold: c.sold,
        share: round4(unitsSold + compSold > 0 ? c.sold / (unitsSold + compSold) : 0),
        stockedOut: c.stockedOut,
      };
    }),
  };

  // 15. Learning signals.
  const nextRepayment = debts.reduce(
    (a, d) => a + d.schedule.filter((s) => s.period === period + 1).reduce((x, s) => x + s.principal, 0),
    0,
  );
  const prev = state.history[state.history.length - 1];
  const learning = learningSignals(outcomes, prev, {
    avgUnitVariableCost: perUnitVariable,
    avgPrice,
    nextRepayment,
    marketingSpend,
    service: scenario.family === "service",
    unit: scenario.products[0]?.unit ?? "unit",
  });

  const newState: SimState = {
    ...state,
    period,
    status,
    ledger: [...state.ledger, ...ctx.transactions],
    inventory,
    pipeline,
    customers: customerState,
    reputation,
    competitors,
    debts,
    activeEvents: ev.active,
    pastEventIds: ev.pastEventIds,
    history: [
      ...state.history,
      {
        period,
        revenue: pnl.revenue,
        profit: pnl.profit,
        netCashFlow: cf.netCashFlow,
        operatingCashFlow: cf.operatingCashFlow,
        closingCash,
        customers: customersTotal,
        unitsSold,
        marketShare,
        avgPrice,
      },
    ],
  };

  return {
    engineVersion: input.engineVersion,
    period,
    seed: input.seed,
    newState,
    transactions: ctx.transactions,
    outcomes,
    events: ev.occurrences,
    explanation: ctx.lines,
    learningSignals: learning,
  };
}

