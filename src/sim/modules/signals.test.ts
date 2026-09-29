import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulate } from "../run.ts";
import { careful } from "../strategies.ts";
import { scenario } from "../testing.ts";
import type { Outcomes, PeriodSummary } from "../types.ts";
import { learningSignals } from "./signals.ts";

const base: Outcomes = simulate({ scenario, simulationId: "sig", cohortId: "sig", strategy: careful, periods: 1 })[0].outcomes;
const prev: PeriodSummary = {
  period: 1, revenue: 100000, profit: 0, netCashFlow: 0, operatingCashFlow: 0, closingCash: 0, customers: 50, unitsSold: 40, marketShare: 0.05, avgPrice: 2500,
};
const ctx = { avgUnitVariableCost: 1350, avgPrice: 2500, nextRepayment: 0, marketingSpend: 0 };
const codes = (o: Outcomes, p = prev, c = ctx) => learningSignals(o, p, c).map((s) => s.code);

describe("learning signals", () => {
  it("asks why revenue rose while cash fell (brief's example question)", () => {
    const s = learningSignals({ ...base, revenue: 150000, netCashFlow: -2000 }, prev, ctx).find(
      (x) => x.code === "REVENUE_UP_CASH_DOWN",
    );
    assert.equal(s?.prompt, "Revenue rose but cash fell. What explains the difference?");
  });

  it("flags pricing at or below the cost of supply", () => {
    assert.ok(codes(base, prev, { ...ctx, avgPrice: 1300 }).includes("PRICE_BELOW_COST"));
    assert.ok(!codes(base).includes("PRICE_BELOW_COST"));
  });

  it("distinguishes a stock-out from hitting capacity", () => {
    const stockout = { ...base, unitsDemanded: 200, unitsSold: 100, unmetUnits: 100, capacityUnits: 700 };
    assert.ok(codes(stockout).includes("STOCKOUT"));
    assert.ok(codes({ ...stockout, capacityUnits: 100 }).includes("CAPACITY_LIMIT"));
  });

  it("warns when a loan repayment is due that cash cannot cover", () => {
    assert.ok(codes({ ...base, closingCash: 1000 }, prev, { ...ctx, nextRepayment: 5000 }).includes("REPAYMENT_AT_RISK"));
  });

  it("every signal asks a question and never gives an instruction", () => {
    const all = learningSignals(
      { ...base, status: "cash_out", closingCash: -5, revenue: 150000, netCashFlow: -1, unitsDemanded: 200, unmetUnits: 100, unitsSold: 100, runwayPeriods: 1, churned: 40 },
      prev,
      { ...ctx, avgPrice: 1000, nextRepayment: 10, marketingSpend: 100000 },
    );
    assert.ok(all.length >= 5);
    for (const s of all) {
      assert.match(s.prompt, /\?$/, s.code);
      assert.doesNotMatch(s.prompt, /^(you should|increase|decrease|lower|raise)/i, s.code);
    }
  });
});
