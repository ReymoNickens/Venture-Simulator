import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cashBalance } from "../context.ts";
import { initialState } from "../engine.ts";
import { campusFoodStall } from "../scenarios/campus-food-stall.ts";
import { groupSeed } from "../seeds.ts";
import { CURRENT_ENGINE_VERSION, runPeriod } from "../versions.ts";
import { withOpeningFinancing } from "./financing.ts";

describe("loans raised before opening", () => {
  const loan = { id: "raised_1_bank", source: "bank" as const, amount: 100000, ratePerPeriodBp: 300, termPeriods: 6 };

  it("are cash at the start and a debt repaid from week 1 with interest", () => {
    const start = withOpeningFinancing(initialState(campusFoodStall, "sim-x"), [loan]);
    assert.equal(cashBalance(start.ledger), campusFoodStall.startingCapital.value + 100000);
    assert.equal(start.debts[0].schedule[0].period, 1);
    const out = runPeriod({
      engineVersion: CURRENT_ENGINE_VERSION,
      scenario: campusFoodStall,
      state: start,
      decisions: {
        period: 1,
        products: { rice_pack: { price: 2500, qualityTier: "standard", order: { supplierId: "market_trader", units: 100 } } },
        marketingBudget: 0,
        eventResponses: {},
      },
      cohortEvents: [],
      seed: groupSeed("sim-x", 1),
      financing: [],
    });
    const interest = out.newState.ledger.filter((t) => t.period === 1 && t.category === "loan_interest").reduce((a, t) => a + t.amount, 0);
    const principal = out.newState.ledger.filter((t) => t.period === 1 && t.category === "loan_principal").reduce((a, t) => a + t.amount, 0);
    assert.equal(interest, -3000, "3% of GHS 1,000");
    assert.equal(principal, -Math.floor(100000 / 6));
    assert.equal(out.newState.debts[0].balance, 100000 - Math.floor(100000 / 6));
  });

  it("at a flat rate cost exactly what the lender quoted", () => {
    // The game quotes GHS 1,000 at 3% a week for 6 weeks as GHS 1,180 to repay.
    let state = withOpeningFinancing(initialState(campusFoodStall, "sim-f"), [{ ...loan, flatInterest: true }]);
    for (let period = 1; period <= 6; period++) {
      state = runPeriod({
        engineVersion: CURRENT_ENGINE_VERSION,
        scenario: campusFoodStall,
        state,
        decisions: { period, products: { rice_pack: { price: 2500, qualityTier: "standard", order: { supplierId: "market_trader", units: 0 } } }, marketingBudget: 0, eventResponses: {} },
        cohortEvents: [],
        seed: groupSeed("sim-f", period),
        financing: [],
      }).newState;
    }
    const paid = (category: string) => -state.ledger.filter((t) => t.ref === loan.id && t.category === category).reduce((a, t) => a + t.amount, 0);
    assert.equal(paid("loan_interest"), 18000);
    assert.equal(paid("loan_principal"), 100000);
    assert.equal(state.debts[0].balance, 0);
  });

  it("still owe in full what was spent before opening, without it being cash", () => {
    const start = withOpeningFinancing(initialState(campusFoodStall, "sim-z"), [{ ...loan, spentBeforeOpening: 30000 }]);
    assert.equal(cashBalance(start.ledger), campusFoodStall.startingCapital.value + 70000);
    assert.equal(start.debts[0].balance, 100000);
  });

  it("refuse nonsense", () => {
    const s = initialState(campusFoodStall, "sim-y");
    assert.throws(() => withOpeningFinancing(s, [{ ...loan, amount: 0 }]));
    assert.throws(() => withOpeningFinancing(s, [loan, loan]));
    assert.throws(() => withOpeningFinancing(s, [{ ...loan, spentBeforeOpening: 100001 }]));
  });
});
