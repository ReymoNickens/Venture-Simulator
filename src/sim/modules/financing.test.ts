import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ctxFor } from "../testing.ts";
import { disburse, repay, repaymentSchedule } from "./financing.ts";

describe("financing", () => {
  it("a repayment schedule always sums to the principal", () => {
    for (const [p, n] of [[100000, 3], [100001, 3], [7, 4], [500000, 1]]) {
      const s = repaymentSchedule(p, n, 2);
      assert.equal(s.reduce((a, i) => a + i.principal, 0), p);
      assert.deepEqual(s.map((i) => i.period), Array.from({ length: n }, (_, i) => 2 + i));
    }
  });

  it("a loan arrives as a ledger transaction and creates a debt", () => {
    const ctx = ctxFor({ period: 1, cash: 0 });
    const debts = disburse(ctx, [], [
      { id: "loan-1", source: "microfinance", amount: 200000, loan: { ratePerPeriodBp: 200, termPeriods: 4, firstRepaymentPeriod: 2 } },
    ]);
    assert.equal(ctx.cash, 200000);
    assert.equal(ctx.transactions[0].category, "financing_in");
    assert.equal(debts[0].balance, 200000);
  });

  it("repayments follow the schedule, charge interest, and reduce cash", () => {
    const setup = ctxFor({ period: 1, cash: 0 });
    let debts = disburse(setup, [], [
      { id: "loan-1", source: "bank", amount: 90000, loan: { ratePerPeriodBp: 100, termPeriods: 3, firstRepaymentPeriod: 2 } },
    ]);
    const ctx = ctxFor({ period: 2, cash: 50000 });
    debts = repay(ctx, debts).debts;
    assert.equal(debts[0].balance, 60000);
    assert.deepEqual(
      ctx.transactions.map((t) => [t.category, t.amount]),
      [["loan_interest", -900], ["loan_principal", -30000]],
    );
    assert.equal(ctx.cash, 50000 - 900 - 30000);
  });

  it("an unaffordable repayment still posts: the debt does not disappear, cash goes negative", () => {
    const setup = ctxFor({ period: 1, cash: 0 });
    const debts = disburse(setup, [], [
      { id: "loan-1", source: "bank", amount: 90000, loan: { ratePerPeriodBp: 0, termPeriods: 1, firstRepaymentPeriod: 2 } },
    ]);
    const ctx = ctxFor({ period: 2, cash: 1000 });
    const after = repay(ctx, debts).debts;
    assert.equal(after[0].balance, 0);
    assert.equal(ctx.cash, 1000 - 90000);
  });

  it("a grant is not a debt", () => {
    const ctx = ctxFor({ cash: 0 });
    const debts = disburse(ctx, [], [{ id: "g1", source: "grant", amount: 50000, loan: null }]);
    assert.equal(debts.length, 0);
    assert.equal(ctx.cash, 50000);
  });

  it("refuses a loan that starts repaying before it is paid out, or is paid out twice", () => {
    const ctx = ctxFor({ period: 3 });
    const loan = { id: "l", source: "bank" as const, amount: 1000, loan: { ratePerPeriodBp: 0, termPeriods: 1, firstRepaymentPeriod: 3 } };
    assert.throws(() => disburse(ctx, [], [loan]));
    const ok = { ...loan, loan: { ...loan.loan, firstRepaymentPeriod: 4 } };
    const debts = disburse(ctx, [], [ok]);
    assert.throws(() => disburse(ctx, debts, [ok]));
  });
});
