// The brief's §6 invariants, checked as properties over thousands of random
// decision sequences (fast-check). On failure fast-check prints the seed and
// the smallest failing input, so every failure is reproducible.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fc from "fast-check";
import { cashBalance } from "./context.ts";
import { simulate } from "./run.ts";
import { scenario } from "./testing.ts";
import type { Decisions, FinancingDisbursement, PeriodOutput, SimState } from "./types.ts";
import { initialState } from "./engine.ts";

const periodDecision = fc.record({
  price: fc.integer({ min: 100, max: 8000 }),
  tier: fc.constantFrom("basic", "standard", "premium"),
  supplier: fc.constantFrom("market_trader", "wholesaler"),
  units: fc.integer({ min: 0, max: 2500 }),
  marketing: fc.integer({ min: 0, max: 150000 }),
  respond: fc.boolean(),
  responsePick: fc.nat(10),
});

const run = fc.record({
  sim: fc.string({ minLength: 1, maxLength: 10 }),
  cohort: fc.string({ minLength: 1, maxLength: 10 }),
  plan: fc.array(periodDecision, { minLength: 6, maxLength: 6 }),
  loan: fc.option(
    fc.record({
      amount: fc.integer({ min: 10000, max: 600000 }),
      bp: fc.integer({ min: 0, max: 800 }),
      term: fc.integer({ min: 1, max: 4 }),
      at: fc.integer({ min: 1, max: 3 }),
    }),
    { nil: null },
  ),
});

type Plan = typeof run extends fc.Arbitrary<infer T> ? T : never;

function play(r: Plan): { outputs: PeriodOutput[]; states: SimState[] } {
  const states: SimState[] = [initialState(scenario, r.sim)];
  const financing = (period: number): FinancingDisbursement[] =>
    r.loan && r.loan.at === period
      ? [
          {
            id: `loan-${period}`,
            source: "microfinance",
            amount: r.loan.amount,
            loan: { ratePerPeriodBp: r.loan.bp, termPeriods: r.loan.term, firstRepaymentPeriod: period + 1 },
          },
        ]
      : [];
  const outputs = simulate({
    scenario,
    simulationId: r.sim,
    cohortId: r.cohort,
    financing,
    strategy: ({ period, state }): Decisions => {
      const p = r.plan[period - 1];
      const eventResponses: Record<string, string> = {};
      if (p.respond) {
        for (const ev of state.activeEvents.filter((e) => e.response === null)) {
          const def = scenario.events.find((e) => e.id === ev.eventId)!;
          eventResponses[ev.instanceId] = def.responses[p.responsePick % def.responses.length].id;
        }
      }
      return {
        period,
        products: { rice_pack: { price: p.price, qualityTier: p.tier, order: { supplierId: p.supplier, units: p.units } } },
        marketingBudget: p.marketing,
        eventResponses,
      };
    },
  });
  for (const o of outputs) states.push(o.newState);
  return { outputs, states };
}

const RUNS = 150;

describe("engine invariants (property-based)", () => {
  it("cash changes only through ledger transactions; balance equals their sum", () => {
    fc.assert(
      fc.property(run, (r) => {
        const { outputs, states } = play(r);
        outputs.forEach((o, i) => {
          const before = states[i];
          const after = states[i + 1];
          assert.equal(o.outcomes.openingCash, cashBalance(before.ledger));
          assert.equal(o.outcomes.closingCash, cashBalance(after.ledger));
          const sum = o.transactions.reduce((a, t) => a + t.amount, 0);
          assert.equal(o.outcomes.closingCash, o.outcomes.openingCash + sum);
          // Append-only: earlier entries are never changed or removed.
          assert.deepEqual(after.ledger.slice(0, before.ledger.length), before.ledger);
          assert.deepEqual(after.ledger.slice(before.ledger.length), o.transactions);
          for (const t of o.transactions) {
            assert.ok(Number.isSafeInteger(t.amount) && t.amount !== 0);
            assert.equal(t.period, o.period);
          }
          // State stores no cash field that could drift from the ledger.
          assert.ok(!("cash" in after));
        });
      }),
      { numRuns: RUNS },
    );
  });

  it("revenue equals recorded sales lines (and the revenue transactions)", () => {
    fc.assert(
      fc.property(run, (r) => {
        for (const o of play(r).outputs) {
          const lines = o.outcomes.salesLines.reduce((a, l) => a + l.amount, 0);
          const txs = o.transactions.filter((t) => t.category === "revenue").reduce((a, t) => a + t.amount, 0);
          assert.equal(o.outcomes.revenue, lines);
          assert.equal(o.outcomes.revenue, txs);
          for (const l of o.outcomes.salesLines) assert.equal(l.amount, l.units * l.price);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("profit equals revenue minus variable minus fixed costs", () => {
    fc.assert(
      fc.property(run, (r) => {
        for (const o of play(r).outputs) {
          const x = o.outcomes;
          assert.equal(x.variableCosts, x.variableCostLines.reduce((a, l) => a + l.amount, 0));
          assert.equal(x.fixedCosts, x.fixedCostLines.reduce((a, l) => a + l.amount, 0));
          assert.equal(x.profit, x.revenue - x.variableCosts - x.fixedCosts);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("inventory never goes negative, and stock flows balance", () => {
    fc.assert(
      fc.property(run, (r) => {
        const { outputs, states } = play(r);
        outputs.forEach((o, i) => {
          for (const [pid, f] of Object.entries(o.outcomes.inventory)) {
            for (const v of Object.values(f)) assert.ok(v >= 0);
            assert.equal(f.opening + f.purchased - f.sold - f.spoiled, f.closing);
            assert.equal(states[i + 1].inventory[pid].units, f.closing);
            assert.ok(states[i + 1].inventory[pid].value >= 0);
          }
          assert.ok(o.outcomes.unitsSold <= o.outcomes.capacityUnits);
          assert.ok(o.outcomes.unitsSold <= o.outcomes.unitsDemanded);
        });
      }),
      { numRuns: RUNS },
    );
  });

  it("debt never disappears; repayments follow the schedule and hit cash", () => {
    fc.assert(
      fc.property(run, (r) => {
        const { outputs, states } = play(r);
        outputs.forEach((o, i) => {
          const before = states[i];
          const after = states[i + 1];
          for (const d of before.debts) {
            const now = after.debts.find((x) => x.id === d.id);
            assert.ok(now, "a debt must never be removed");
            const due = d.schedule.filter((s) => s.period === o.period).reduce((a, s) => a + s.principal, 0);
            const paid = o.transactions
              .filter((t) => t.category === "loan_principal" && t.ref === d.id)
              .reduce((a, t) => a - t.amount, 0);
            assert.equal(paid, Math.min(due, d.balance));
            assert.equal(now.balance, d.balance - paid);
          }
          for (const d of after.debts) {
            const repaid = after.ledger
              .filter((t) => t.category === "loan_principal" && t.ref === d.id)
              .reduce((a, t) => a - t.amount, 0);
            assert.equal(d.balance, d.principal - repaid);
            assert.ok(d.balance >= 0);
          }
        });
        // A loan taken before the last period is fully repaid by its schedule.
        const final = states[states.length - 1];
        for (const d of final.debts) {
          const last = Math.max(...d.schedule.map((s) => s.period));
          if (last <= final.period) assert.equal(d.balance, 0);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("customers never exceed awareness, awareness never exceeds the market", () => {
    fc.assert(
      fc.property(run, (r) => {
        for (const o of play(r).outputs) {
          for (const s of o.outcomes.segments) {
            const size = scenario.segments.find((x) => x.id === s.segmentId)!.marketSize.value;
            assert.ok(s.customers <= s.aware && s.aware <= size);
            assert.ok(s.unitsSold + s.unmetUnits === s.demandUnits);
          }
          assert.ok(o.outcomes.reputation >= 0 && o.outcomes.reputation <= 100);
          assert.ok(o.outcomes.marketShare >= 0 && o.outcomes.marketShare <= 1);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("every transaction points at an explanation line that exists", () => {
    fc.assert(
      fc.property(run, (r) => {
        for (const o of play(r).outputs) {
          const ids = new Set(o.explanation.map((l) => l.id));
          for (const t of o.transactions) assert.ok(ids.has(t.explainId), `${t.memo} has no explanation`);
        }
      }),
      { numRuns: 50 },
    );
  });
});
