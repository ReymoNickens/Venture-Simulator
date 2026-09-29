// Finance: profit and loss, cash flow (kept separate from profit on
// purpose), break-even and runway. Everything is derived from the period's
// transactions and cost lines; nothing is typed in.
import type { PeriodContext } from "../context.ts";
import { formatGhs } from "../money.ts";
import type { CostLine, PeriodSummary, SalesLine, Transaction } from "../types.ts";

export interface ProfitAndLoss {
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  profit: number;
}

export function sumLines(lines: readonly { amount: number }[]): number {
  let s = 0;
  for (const l of lines) s += l.amount;
  return s;
}

export function profitAndLoss(
  sales: readonly SalesLine[],
  variable: readonly CostLine[],
  fixed: readonly CostLine[],
): ProfitAndLoss {
  const revenue = sumLines(sales);
  const variableCosts = sumLines(variable);
  const fixedCosts = sumLines(fixed);
  return { revenue, variableCosts, fixedCosts, profit: revenue - variableCosts - fixedCosts };
}

const NON_OPERATING = new Set<Transaction["category"]>(["capital", "financing_in", "loan_principal"]);

export function cashFlow(txs: readonly Transaction[]) {
  let cashIn = 0;
  let cashOut = 0;
  let operating = 0;
  for (const t of txs) {
    if (t.amount > 0) cashIn += t.amount;
    else cashOut += -t.amount;
    if (!NON_OPERATING.has(t.category)) operating += t.amount;
  }
  return { cashIn, cashOut, netCashFlow: cashIn - cashOut, operatingCashFlow: operating };
}

/**
 * Units needed to cover fixed costs at this period's average price and
 * variable cost per unit. Null when each sale loses money (no break-even).
 */
export function breakEven(
  fixedCosts: number,
  avgPrice: number,
  variableCostPerUnit: number,
): { units: number | null; revenue: number | null } {
  const contribution = avgPrice - variableCostPerUnit;
  if (contribution <= 0) return { units: null, revenue: null };
  const units = Math.ceil(fixedCosts / contribution);
  return { units, revenue: units * avgPrice };
}

/** Periods of cash left at the average operating burn of the last 3 periods. */
export function runway(
  closingCash: number,
  history: readonly PeriodSummary[],
  operatingCashFlow: number,
): number | null {
  const recent = [...history.slice(-2).map((h) => h.operatingCashFlow), operatingCashFlow];
  const avg = sumLines(recent.map((amount) => ({ amount }))) / recent.length;
  if (avg >= 0) return null;
  if (closingCash <= 0) return 0;
  return Math.floor((closingCash / -avg) * 10) / 10;
}

export function explainFinance(
  ctx: PeriodContext,
  pnl: ProfitAndLoss,
  cf: ReturnType<typeof cashFlow>,
  openingCash: number,
  closingCash: number,
  lineIds: string[],
): void {
  ctx.explain(
    "finance",
    "profit",
    pnl.profit,
    `Profit ${formatGhs(pnl.profit)} = revenue ${formatGhs(pnl.revenue)} − variable costs ${formatGhs(pnl.variableCosts)} − fixed costs ${formatGhs(pnl.fixedCosts)}.`,
    { lines: lineIds },
  );
  ctx.explain(
    "finance",
    "cash",
    closingCash,
    `Cash went from ${formatGhs(openingCash)} to ${formatGhs(closingCash)} (in ${formatGhs(cf.cashIn)}, out ${formatGhs(cf.cashOut)}). Cash and profit differ because stock is paid for when bought but counted as a cost only when sold or spoiled, and loans move cash without being income or expense.`,
    { lines: lineIds },
  );
}
