import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ctxFor, decisionsFor, freshState, scenario } from "../testing.ts";
import type { ActiveEvent, Scenario } from "../types.ts";
import { drawCohortEvents, stepEvents } from "./events.ts";

const always: Scenario = {
  ...scenario,
  events: scenario.events.map((e) => ({ ...e, probability: { value: 1, assumption: true } })),
};

describe("cohort events", () => {
  it("are drawn identically for the same cohort seed (every group sees the same world)", () => {
    const a = drawCohortEvents(scenario, "cohort:ucc:3", 3, [], []);
    const b = drawCohortEvents(scenario, "cohort:ucc:3", 3, [], []);
    assert.deepEqual(a, b);
  });

  it("never start before the first event period", () => {
    assert.deepEqual(drawCohortEvents(always, "c", 1, [], []), []);
  });

  it("respect the per-period cap, active events and once-per-run", () => {
    const drawn = drawCohortEvents(always, "c", 2, [], []);
    assert.equal(drawn.length, 2);
    const ids = always.events.filter((e) => e.scope === "cohort").map((e) => e.id);
    const blocked = drawCohortEvents(always, "c", 2, ids.filter((id) => id !== "new_entrant"), ["new_entrant"]);
    assert.deepEqual(blocked, []);
  });

  it("the lecturer's frequency dial at 0 switches random events off", () => {
    const off: Scenario = { ...always, eventSettings: { ...always.eventSettings, frequency: { value: 0, assumption: true } } };
    for (let p = 2; p <= 6; p++) assert.deepEqual(drawCohortEvents(off, `c${p}`, p, [], []), []);
  });
});

describe("event lifecycle", () => {
  const started = (period: number): ActiveEvent => ({
    instanceId: `power_outage@${period}`,
    eventId: "power_outage",
    scope: "cohort",
    startedPeriod: period,
    endsAfterPeriod: period + 1,
    response: null,
    respondedPeriod: null,
    responseWasDefault: false,
  });

  it("a new event applies its impact and offers responses", () => {
    const ctx = ctxFor({ period: 2 });
    const r = stepEvents(ctx, freshState(), decisionsFor(2), [
      { instanceId: "power_outage@2", eventId: "power_outage", period: 2, origin: "drawn" },
    ]);
    assert.equal(r.modifiers.capacity, 0.7);
    assert.equal(r.occurrences[0].status, "new");
    assert.equal(r.occurrences[0].availableResponses.length, 3);
    assert.equal(r.occurrences[0].mustRespondBy, 3);
  });

  it("the chosen response replaces the impact, and its cost is posted once", () => {
    const state = { ...freshState(), period: 2, activeEvents: [started(2)] };
    const ctx = ctxFor({ period: 3, cash: 100000 });
    const r = stepEvents(ctx, state, decisionsFor(3, { eventResponses: { "power_outage@2": "rent_generator" } }), []);
    assert.equal(r.modifiers.capacity, 0.95);
    assert.equal(r.modifiers.fixedCostAdd, 25000);
    assert.equal(r.active[0].response, "rent_generator");
    assert.equal(r.active[0].responseWasDefault, false);
    assert.deepEqual(ctx.transactions.map((t) => [t.category, t.amount]), [["event_response", -5000]]);
  });

  it("no response in time means the default applies, and it is recorded as the default", () => {
    const state = { ...freshState(), period: 2, activeEvents: [started(2)] };
    const r = stepEvents(ctxFor({ period: 3 }), state, decisionsFor(3), []);
    assert.equal(r.active[0].response, "wait");
    assert.equal(r.active[0].responseWasDefault, true);
  });

  it("a response is final: it cannot be changed later", () => {
    const answered = { ...started(2), response: "wait", respondedPeriod: 3 };
    const state = { ...freshState(), period: 3, activeEvents: [{ ...answered, endsAfterPeriod: 4 }] };
    assert.throws(() =>
      stepEvents(ctxFor({ period: 4 }), state, decisionsFor(4, { eventResponses: { "power_outage@2": "rent_generator" } }), []),
    );
  });

  it("rejects a response to an event that is not happening, or an unknown response", () => {
    assert.throws(() =>
      stepEvents(ctxFor({ period: 3 }), freshState(), decisionsFor(3, { eventResponses: { "x@1": "y" } }), []),
    );
    const state = { ...freshState(), period: 2, activeEvents: [started(2)] };
    assert.throws(() =>
      stepEvents(ctxFor({ period: 3 }), state, decisionsFor(3, { eventResponses: { "power_outage@2": "bribe" } }), []),
    );
  });

  it("expired events stop applying", () => {
    const state = { ...freshState(), period: 4, activeEvents: [{ ...started(2), response: "wait" }] };
    const r = stepEvents(ctxFor({ period: 5 }), state, decisionsFor(5), []);
    assert.ok(!r.active.some((e) => e.instanceId === "power_outage@2"));
    assert.equal(r.modifiers.capacity, 1);
  });

  it("a group event needs its trigger: no storage failure without much stock", () => {
    const empty = stepEvents(ctxFor({ period: 3, scenario: always }), { ...freshState(), period: 2 }, decisionsFor(3), []);
    assert.ok(!empty.active.some((e) => e.eventId === "storage_failure"));
    const stocked = { ...freshState(), period: 2, inventory: { rice_pack: { units: 400, value: 400000 } } };
    const full = stepEvents(ctxFor({ period: 3, scenario: always }), stocked, decisionsFor(3), []);
    assert.ok(full.active.some((e) => e.eventId === "storage_failure"));
  });
});
