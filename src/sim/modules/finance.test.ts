import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breakEven, cashFlow, profitAndLoss, runway } from "./finance.ts";
import type { Transaction } from "../types.ts";

const tx = (category: Transaction["category"], amount: number): Transaction => ({
  id: "x",
  period: 1,
  category,
  amount,
  memo: "",
  ref: null,
  explainId: "",
});

describe("finance", () => {
  it("profit is revenue minus variable minus fixed costs", () => {
    const pnl = profitAndLoss(
      [{ productId: "p", segmentId: "s", units: 10, price: 100, amount: 1000 }],
      [{ label: "cogs", amount: 400, cash: false, explainId: "" }],
      [{ label: "rent", amount: 300, cash: true, explainId: "" }],
    );
    assert.deepEqual(pnl, { revenue: 1000, variableCosts: 400, fixedCosts: 300, profit: 300 });
  });

  it("cash flow separates operating cash from financing", () => {
    const cf = cashFlow([tx("capital", 5000), tx("revenue", 1000), tx("fixed_cost", -300), tx("loan_principal", -200)]);
    assert.deepEqual(cf, { cashIn: 6000, cashOut: 500, netCashFlow: 5500, operatingCashFlow: 700 });
  });

  it("break-even is fixed costs over contribution per unit, rounded up", () => {
    assert.deepEqual(breakEven(1000, 300, 100), { units: 5, revenue: 1500 });
    assert.deepEqual(breakEven(1001, 300, 100), { units: 6, revenue: 1800 });
  });

  it("there is no break-even when every sale loses money", () => {
    assert.deepEqual(breakEven(1000, 100, 100), { units: null, revenue: null });
  });

  it("runway is cash over the recent average burn; none when not burning", () => {
    const h = (operatingCashFlow: number) => ({
      period: 1, revenue: 0, profit: 0, netCashFlow: 0, operatingCashFlow, closingCash: 0, customers: 0, unitsSold: 0, marketShare: 0, avgPrice: 0,
    });
    assert.equal(runway(9000, [h(-3000), h(-3000)], -3000), 3);
    assert.equal(runway(9000, [h(1000)], 500), null);
    assert.equal(runway(-5, [], -1), 0);
  });
});
