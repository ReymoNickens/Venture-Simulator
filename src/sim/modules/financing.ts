// Financing: money the server has approved arrives as ledger transactions,
// and loans create repayment schedules that hit future cash flow. A debt only
// shrinks through a posted repayment; nothing else can remove it.
import { EngineInputError, type PeriodContext } from "../context.ts";
import { assertPesewas, formatGhs, toPesewas } from "../money.ts";
import type { Debt, FinancingDisbursement, RepaymentInstalment } from "../types.ts";

const SOURCE_LABEL: Record<FinancingDisbursement["source"], string> = {
  founder: "Founder capital",
  family: "Family and friends",
  microfinance: "Microfinance loan",
  bank: "Bank loan",
  grant: "Grant",
  investor: "Investor",
};

/** Equal principal instalments; the last one absorbs rounding. */
export function repaymentSchedule(
  principal: number,
  termPeriods: number,
  firstPeriod: number,
): RepaymentInstalment[] {
  const each = Math.floor(principal / termPeriods);
  const schedule: RepaymentInstalment[] = [];
  for (let i = 0; i < termPeriods; i++) {
    const isLast = i === termPeriods - 1;
    schedule.push({ period: firstPeriod + i, principal: isLast ? principal - each * (termPeriods - 1) : each });
  }
  return schedule;
}

export function disburse(
  ctx: PeriodContext,
  debts: Debt[],
  financing: readonly FinancingDisbursement[],
): Debt[] {
  const next = debts.map((d) => ({ ...d, schedule: [...d.schedule] }));
  for (const f of financing) {
    assertPesewas(f.amount, `financing ${f.id}`);
    if (f.amount <= 0) throw new EngineInputError(`Financing ${f.id} must be a positive amount`);
    if (next.some((d) => d.id === f.id)) throw new EngineInputError(`Financing ${f.id} was already disbursed`);
    const label = SOURCE_LABEL[f.source];
    if (f.loan) {
      const { ratePerPeriodBp, termPeriods, firstRepaymentPeriod } = f.loan;
      if (!Number.isInteger(termPeriods) || termPeriods < 1) {
        throw new EngineInputError(`Loan ${f.id} needs a term of at least one period`);
      }
      if (firstRepaymentPeriod <= ctx.period) {
        throw new EngineInputError(`Loan ${f.id} cannot start repaying before it is disbursed`);
      }
      const schedule = repaymentSchedule(f.amount, termPeriods, firstRepaymentPeriod);
      const lineId = ctx.explain(
        "financing",
        "loan_disbursed",
        f.amount,
        `${label} of ${formatGhs(f.amount)} received. Interest ${ratePerPeriodBp / 100}% per period on the balance; principal repaid in ${termPeriods} instalments from period ${firstRepaymentPeriod}.`,
        { lines: [] },
      );
      ctx.post("financing_in", f.amount, label, f.id, lineId);
      next.push({
        id: f.id,
        source: f.source,
        principal: f.amount,
        balance: f.amount,
        ratePerPeriodBp,
        schedule,
        disbursedPeriod: ctx.period,
      });
    } else {
      const lineId = ctx.explain("financing", "capital_in", f.amount, `${label} of ${formatGhs(f.amount)} received. It does not have to be repaid.`);
      ctx.post(f.source === "founder" ? "capital" : "financing_in", f.amount, label, f.id, lineId);
    }
  }
  return next;
}

/**
 * Charge interest on every outstanding balance and collect the principal due
 * this period. Payments always post, even if cash goes negative: an unpaid
 * bill is a cash-out, not a disappearing debt.
 */
export function repay(ctx: PeriodContext, debts: Debt[]): { debts: Debt[]; interest: number } {
  let interestTotal = 0;
  const next = debts.map((d) => {
    if (d.balance <= 0) return d;
    const interest = toPesewas((d.balance * d.ratePerPeriodBp) / 10000);
    const due = d.schedule.filter((s) => s.period === ctx.period).reduce((s, i) => s + i.principal, 0);
    const principal = Math.min(due, d.balance);
    const label = SOURCE_LABEL[d.source];
    if (interest > 0) {
      const lineId = ctx.explain(
        "financing",
        "loan_interest",
        interest,
        `${label}: interest ${formatGhs(interest)} = balance ${formatGhs(d.balance)} × ${d.ratePerPeriodBp / 100}%.`,
      );
      ctx.post("loan_interest", -interest, `${label} interest`, d.id, lineId);
      interestTotal += interest;
    }
    if (principal > 0) {
      const lineId = ctx.explain(
        "financing",
        "loan_principal",
        principal,
        `${label}: scheduled repayment of ${formatGhs(principal)}. Balance falls to ${formatGhs(d.balance - principal)}.`,
      );
      ctx.post("loan_principal", -principal, `${label} repayment`, d.id, lineId);
    }
    return { ...d, balance: d.balance - principal };
  });
  return { debts: next, interest: interestTotal };
}
