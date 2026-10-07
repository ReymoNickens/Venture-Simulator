import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialState } from "../engine.ts";
import { CohortEventLog } from "../run.ts";
import { groupSeed } from "../seeds.ts";
import { careful, careless, type Strategy } from "../strategies.ts";
import { findUnsourcedParams } from "../params.ts";
import type { PeriodOutput, Scenario } from "../types.ts";
import { CURRENT_ENGINE_VERSION, runPeriod } from "../versions.ts";
import { campusFoodStall } from "./campus-food-stall.ts";
import { checkVentureNumbers, scenarioFromVenture, type VentureNumbers } from "./own-venture.ts";

const shuttle: VentureNumbers = {
  offer: "Shuttle seat booking",
  unit: "seat",
  kind: "service",
  costPerUnit: 150,
  price: 300,
  alternatives: [
    { name: "Dropping taxi", price: 600 },
    { name: "Campus shuttle", price: 100 },
  ],
  peoplePerWeek: 900,
  buysPerWeek: 4,
  capacityPerWeek: 1200,
  wasteShare: 0,
  fixedCosts: [
    { label: "Bus hire", amount: 60000 },
    { label: "Data and airtime", amount: 2000 },
  ],
};

const prints: VentureNumbers = {
  ...shuttle,
  offer: "Order-ahead printing",
  unit: "print job",
  kind: "goods",
  costPerUnit: 200,
  price: 500,
  alternatives: [{ name: "Science print shops", price: 400 }],
  peoplePerWeek: 600,
  buysPerWeek: 1,
  capacityPerWeek: 300,
  wasteShare: 0.1,
  fixedCosts: [{ label: "Printer lease", amount: 30000 }],
};

/** Run like the server: class events from the class's scenario, the rest from the group's. */
function play(scenario: Scenario, strategy: Strategy, sim = "group-1", cohort = "class-1"): PeriodOutput[] {
  const classEvents = new CohortEventLog();
  let state = initialState(scenario, sim);
  let last: PeriodOutput | null = null;
  const out: PeriodOutput[] = [];
  for (let period = 1; period <= scenario.periodCount.value; period++) {
    const cohortEvents = classEvents.draw(campusFoodStall, cohort, period);
    last = runPeriod({
      engineVersion: CURRENT_ENGINE_VERSION,
      scenario,
      state,
      decisions: strategy({ scenario, state, period, last }),
      cohortEvents,
      seed: groupSeed(sim, period),
      financing: [],
    });
    out.push(last);
    state = last.newState;
    if (last.outcomes.status === "exited") break;
  }
  return out;
}

describe("a group's own venture as a scenario", () => {
  it("every number is either the group's own claim or a design setting", () => {
    assert.deepEqual(findUnsourcedParams(scenarioFromVenture(shuttle)), []);
  });

  it("carries every class-wide event, with the same length, so draws are shared fairly", () => {
    const own = scenarioFromVenture(shuttle);
    for (const e of campusFoodStall.events.filter((x) => x.scope === "cohort")) {
      const mine = own.events.find((x) => x.id === e.id);
      assert.ok(mine, `missing class event ${e.id}`);
      assert.equal(mine.scope, "cohort");
      assert.equal(mine.duration, e.duration);
      assert.ok(mine.responses.some((r) => r.id === mine.defaultResponseId));
    }
  });

  it("runs all six weeks for a service and for goods, whatever the class's events", () => {
    for (const n of [shuttle, prints]) {
      for (const cohort of ["class-1", "class-2", "class-3"]) {
        const out = play(scenarioFromVenture(n), careful, "g", cohort);
        assert.equal(out.length, 6, `${n.offer} in ${cohort}`);
        for (const o of out) assert.ok(Number.isSafeInteger(o.outcomes.closingCash));
      }
    }
  });

  it("rewards careful decisions over careless ones", () => {
    const s = scenarioFromVenture(prints);
    const end = (o: PeriodOutput[]) => o[o.length - 1].outcomes.closingCash;
    assert.ok(end(play(s, careful)) > end(play(s, careless)));
  });

  it("a service cannot carry unused capacity into next week", () => {
    const s = scenarioFromVenture(shuttle);
    const out = play(s, careless);
    for (const o of out) assert.equal(o.outcomes.inventory.offer.closing, 0);
  });

  it("uses the class's weeks and starting cash", () => {
    const frame = structuredClone(campusFoodStall);
    frame.periodCount = { value: 4, assumption: true };
    frame.startingCapital = { value: 250000, assumption: true };
    const s = scenarioFromVenture(shuttle, frame);
    assert.equal(s.periodCount.value, 4);
    assert.equal(s.startingCapital.value, 250000);
  });

  it("explains what is missing in plain words", () => {
    const problems = checkVentureNumbers({ ...shuttle, offer: "", costPerUnit: 0, alternatives: [{ name: "Walk", price: 0 }] });
    assert.ok(problems.includes("Say what you sell."));
    assert.ok(problems.includes("Enter what one costs you to provide."));
    assert.ok(problems.some((p) => /alternative/.test(p)));
    assert.deepEqual(checkVentureNumbers(shuttle), []);
  });
});
