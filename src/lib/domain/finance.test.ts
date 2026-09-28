import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinance, emptyFinanceInputs, formatCedis, parseFinanceInputs } from "./finance.ts";

const base = () => ({
  ...emptyFinanceInputs(),
  unitName: "weekly laundry bag",
  price: 30,
  priceEvidenceId: "ev-price",
  variableCosts: [
    { id: "a", label: "Detergent", amount: 6, evidenceId: "ev-1" },
    { id: "b", label: "Water", amount: 4, evidenceId: "ev-2" },
  ],
  fixedCosts: [{ id: "c", label: "Stall rent", amount: 400, evidenceId: "ev-3" }],
  startupCosts: [{ id: "d", label: "Washing machine (used)", amount: 2400, evidenceId: null }],
  expectedUnitsPerMonth: 60,
});

describe("computeFinance", () => {
  it("computes contribution, break-even and payback", () => {
    const r = computeFinance(base());
    assert.equal(r.variableCostPerUnit, 10);
    assert.equal(r.contributionPerUnit, 20);
    assert.equal(r.breakEvenUnits, 20);
    assert.equal(r.monthlyProfit, 800);
    assert.equal(r.paybackMonths, 3);
    assert.equal(r.startupTotal, 2400);
  });

  it("flags a price that does not cover unit costs and gives no break-even", () => {
    const r = computeFinance({ ...base(), price: 9 });
    assert.equal(r.breakEvenUnits, null);
    assert.ok(r.warnings.some((w) => w.code === "PRICE_BELOW_COST"));
    assert.equal(r.paybackMonths, null);
  });

  it("flags an unsupported price and unsourced costs", () => {
    const r = computeFinance({
      ...base(),
      priceEvidenceId: null,
      variableCosts: base().variableCosts.map((l) => ({ ...l, evidenceId: null })),
      fixedCosts: base().fixedCosts.map((l) => ({ ...l, evidenceId: null })),
    });
    const codes = r.warnings.map((w) => w.code);
    assert.ok(codes.includes("PRICE_UNSUPPORTED"));
    assert.ok(codes.includes("COSTS_UNSOURCED"));
  });

  it("warns when expected sales are below break-even", () => {
    const r = computeFinance({ ...base(), expectedUnitsPerMonth: 10 });
    assert.ok(r.warnings.some((w) => w.code === "BELOW_BREAK_EVEN"));
    assert.ok(r.monthlyProfit < 0);
  });

  it("stress-tests a cost shock", () => {
    const r = computeFinance({ ...base(), price: 12, fixedCosts: [], expectedUnitsPerMonth: 100 });
    assert.ok(r.monthlyProfit > 0);
    assert.ok(r.profitIfCostsRise < r.monthlyProfit);
    assert.ok(r.warnings.some((w) => w.code === "THIN_MARGIN"));
  });

  it("ignores negative and non-numeric amounts", () => {
    const r = computeFinance({
      ...base(),
      variableCosts: [{ id: "x", label: "Bad", amount: -50 }],
    });
    assert.equal(r.variableCostPerUnit, 0);
  });
});

describe("formatCedis", () => {
  it("formats cedis with pesewas", () => {
    assert.equal(formatCedis(1234.5), "GH₵ 1,234.50");
    assert.equal(formatCedis(-20), "−GH₵ 20.00");
    assert.equal(formatCedis(null), "—");
  });
});

describe("parseFinanceInputs", () => {
  it("survives malformed rows", () => {
    assert.deepEqual(parseFinanceInputs("{not json"), emptyFinanceInputs());
    const v = parseFinanceInputs(JSON.stringify({ price: "25", variableCosts: [{ label: "x", amount: "3" }] }));
    assert.equal(v.price, 25);
    assert.equal(v.variableCosts[0].amount, 3);
  });
});
