// Learning signals: observations about this period that are worth
// reflecting on. They describe and ask; they never tell students what to do.
import type { LearningSignal, Outcomes, PeriodSummary } from "../types.ts";
import { formatGhs } from "../money.ts";

export function learningSignals(
  o: Outcomes,
  prev: PeriodSummary | undefined,
  context: { avgUnitVariableCost: number; avgPrice: number; nextRepayment: number; marketingSpend: number },
): LearningSignal[] {
  const out: LearningSignal[] = [];
  const add = (s: LearningSignal) => out.push(s);

  if (o.status === "cash_out") {
    add({
      code: "CASH_OUT",
      severity: "critical",
      message: `The venture ran out of cash: it ended the period ${formatGhs(o.closingCash)} short of what it owed.`,
      prompt: "Looking back over the periods, when was the first sign this could happen, and what did you decide at that point?",
      metrics: { closingCash: o.closingCash },
    });
  }
  if (prev && o.revenue > prev.revenue && o.netCashFlow < 0) {
    add({
      code: "REVENUE_UP_CASH_DOWN",
      severity: "warning",
      message: `Revenue rose from ${formatGhs(prev.revenue)} to ${formatGhs(o.revenue)}, but cash fell by ${formatGhs(-o.netCashFlow)}.`,
      prompt: "Revenue rose but cash fell. What explains the difference?",
      metrics: { revenue: o.revenue, prevRevenue: prev.revenue, netCashFlow: o.netCashFlow },
    });
  }
  if (o.profit > 0 && o.operatingCashFlow < 0) {
    add({
      code: "PROFIT_NOT_CASH",
      severity: "info",
      message: `You made a profit of ${formatGhs(o.profit)} but operations used ${formatGhs(-o.operatingCashFlow)} of cash.`,
      prompt: "Where did the cash go, if not into losses?",
      metrics: { profit: o.profit, operatingCashFlow: o.operatingCashFlow },
    });
  }
  if (o.unitsDemanded > 0 && o.unmetUnits >= Math.max(5, o.unitsDemanded * 0.1)) {
    const capacityBound = o.unitsSold >= o.capacityUnits;
    add({
      code: capacityBound ? "CAPACITY_LIMIT" : "STOCKOUT",
      severity: "warning",
      message: `Customers wanted ${o.unitsDemanded} units; you sold ${o.unitsSold}. ${o.unmetUnits} went unserved.`,
      prompt: capacityBound
        ? "You hit the most you can produce. What would it cost to serve more, and is that worth it?"
        : "What did you expect demand to be when you placed your order, and what was that expectation based on?",
      metrics: { demanded: o.unitsDemanded, sold: o.unitsSold, unmet: o.unmetUnits, capacity: o.capacityUnits },
    });
  }
  const spoiled = Object.values(o.inventory).reduce((s, i) => s + i.spoiled, 0);
  const handled = Object.values(o.inventory).reduce((s, i) => s + i.opening + i.purchased, 0);
  if (handled > 0 && spoiled >= handled * 0.15) {
    add({
      code: "HIGH_SPOILAGE",
      severity: "warning",
      message: `${spoiled} units spoiled, ${Math.round((spoiled / handled) * 100)}% of the stock you handled.`,
      prompt: "What does this tell you about how you are forecasting demand?",
      metrics: { spoiled, handled },
    });
  }
  if (context.avgPrice > 0 && context.avgPrice <= context.avgUnitVariableCost) {
    add({
      code: "PRICE_BELOW_COST",
      severity: "critical",
      message: `Each unit sells for ${formatGhs(context.avgPrice)} but costs about ${formatGhs(context.avgUnitVariableCost)} to supply. Every sale loses money.`,
      prompt: "What were you trying to achieve with this price, and is there evidence it is working?",
      metrics: { avgPrice: context.avgPrice, unitCost: context.avgUnitVariableCost },
    });
  } else if (o.breakEvenUnits !== null && o.unitsSold < o.breakEvenUnits) {
    add({
      code: "BELOW_BREAK_EVEN",
      severity: "info",
      message: `You sold ${o.unitsSold} units; you needed about ${o.breakEvenUnits} to cover fixed costs.`,
      prompt: "Which lever is most realistic to close that gap: price, volume or costs? What evidence do you have?",
      metrics: { sold: o.unitsSold, breakEvenUnits: o.breakEvenUnits },
    });
  }
  if (o.runwayPeriods !== null && o.runwayPeriods <= 2 && o.status !== "cash_out") {
    add({
      code: "RUNWAY_SHORT",
      severity: "warning",
      message: `At the recent rate of spending, cash lasts about ${o.runwayPeriods} more period(s).`,
      prompt: "What has to be true next period for the venture to still be here in three periods?",
      metrics: { runway: o.runwayPeriods, closingCash: o.closingCash },
    });
  }
  if (prev && prev.customers >= 10 && o.churned >= prev.customers * 0.4) {
    add({
      code: "CHURN_HIGH",
      severity: "warning",
      message: `${o.churned} of last period's ${prev.customers} customers did not come back.`,
      prompt: "Why might customers who already tried you choose someone else?",
      metrics: { churned: o.churned, prevCustomers: prev.customers },
    });
  }
  if (context.marketingSpend > 0 && o.newCustomers > 0) {
    const perCustomer = Math.round(context.marketingSpend / o.newCustomers);
    if (context.avgPrice > 0 && perCustomer > context.avgPrice * 3) {
      add({
        code: "MARKETING_COSTLY",
        severity: "info",
        message: `Marketing cost about ${formatGhs(perCustomer)} per new customer.`,
        prompt: "How many times must a new customer buy before that marketing pays for itself?",
        metrics: { costPerNewCustomer: perCustomer },
      });
    }
  }
  if (context.nextRepayment > 0 && context.nextRepayment > o.closingCash) {
    add({
      code: "REPAYMENT_AT_RISK",
      severity: "warning",
      message: `${formatGhs(context.nextRepayment)} of loan repayment is due next period; you have ${formatGhs(o.closingCash)}.`,
      prompt: "Where will next period's repayment come from?",
      metrics: { nextRepayment: context.nextRepayment, closingCash: o.closingCash },
    });
  }
  return out;
}
