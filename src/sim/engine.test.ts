import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./canonical.ts";
import { EngineInputError } from "./context.ts";
import { runPeriodV1 } from "./engine.ts";
import { simulate } from "./run.ts";
import { careful, careless } from "./strategies.ts";
import { decisionsFor, freshState, inputFor, scenario } from "./testing.ts";
import type { PeriodOutput, Scenario } from "./types.ts";
import { runPeriod, supportedEngineVersions } from "./versions.ts";
import { studentView } from "./view.ts";

const runCareful = (sim = "sim-a", cohort = "cohort-a") =>
  simulate({ scenario, simulationId: sim, cohortId: cohort, strategy: careful });

describe("determinism", () => {
  it("same engine version, scenario, state, decisions and seed give identical output", () => {
    assert.equal(canonicalJson(runCareful()), canonicalJson(runCareful()));
  });

  it("a different seed gives different output", () => {
    assert.notEqual(canonicalJson(runCareful("sim-a")), canonicalJson(runCareful("sim-b")));
  });

  it("the output is plain JSON: serialising and re-reading it loses nothing", () => {
    const out = runCareful();
    assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  });

  it("the CLI prints byte-identical output on two separate runs", () => {
    const cli = join(dirname(fileURLToPath(import.meta.url)), "cli.ts");
    const runCli = () =>
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--no-warnings", cli, "--json", "--strategy", "careless", "--sim", "cli-1"],
        { encoding: "utf8" },
      );
    const a = runCli();
    assert.ok(a.length > 1000);
    assert.equal(a, runCli());
  });
});

describe("fairness (ADR 0004)", () => {
  it("two groups in one cohort face the same external events", () => {
    const eventsOf = (outs: PeriodOutput[]) =>
      outs.map((o) => o.events.filter((e) => e.scope === "cohort").map((e) => e.instanceId));
    const a = runCareful("group-1", "cohort-x");
    const b = runCareful("group-2", "cohort-x");
    assert.deepEqual(eventsOf(a), eventsOf(b));
    // ...but customer behaviour differs, so the groups are not identical.
    assert.notDeepEqual(
      a.map((o) => o.outcomes.unitsDemanded),
      b.map((o) => o.outcomes.unitsDemanded),
    );
  });
});

describe("period ordering", () => {
  it("a period cannot be skipped", () => {
    const state = freshState();
    assert.throws(() => runPeriodV1(inputFor(state, { decisions: decisionsFor(2) })), EngineInputError);
  });

  it("a period cannot be run twice from its own result", () => {
    const state = freshState();
    const out = runPeriodV1(inputFor(state));
    assert.throws(() => runPeriodV1(inputFor(out.newState, { decisions: decisionsFor(1) })), EngineInputError);
  });

  it("cannot run beyond the configured number of periods", () => {
    const short: Scenario = { ...scenario, periodCount: { value: 1, assumption: true } };
    const out = runPeriodV1(inputFor(freshState(), { scenario: short }));
    assert.throws(() => runPeriodV1(inputFor(out.newState, { scenario: short })), /only 1 periods/);
  });

  it("an exited venture cannot run", () => {
    assert.throws(() => runPeriodV1(inputFor({ ...freshState(), status: "exited" })), /exited/);
  });
});

describe("engine versioning", () => {
  it("a stored simulation keeps the engine it started with", () => {
    const state = { ...freshState(), engineVersion: "0.9.0" };
    assert.throws(() => runPeriod(inputFor(state)), /engine 0.9.0/);
  });

  it("an unknown engine version is refused, not silently run on the current one", () => {
    assert.throws(() => runPeriod(inputFor(freshState(), { engineVersion: "9.9.9" })), /Unknown engine version/);
    assert.deepEqual(supportedEngineVersions(), ["1.0.0"]);
  });

  it("refuses a scenario that allows backorders (v1 never lets stock go negative)", () => {
    const bo: Scenario = { ...scenario, operations: { ...scenario.operations, backordersEnabled: true } };
    assert.throws(() => runPeriodV1(inputFor(freshState(), { scenario: bo })), /Backorders/);
  });

  it("refuses a scenario other than the one the simulation started with", () => {
    const other: Scenario = { ...scenario, version: 2 };
    assert.throws(() => runPeriodV1(inputFor(freshState(), { scenario: other })), /scenario/);
  });
});

describe("input validation", () => {
  const bad = (d: ReturnType<typeof decisionsFor>) => () => runPeriodV1(inputFor(freshState(), { decisions: d }));
  it("rejects fractional, zero or negative money and quantities", () => {
    const d1 = decisionsFor(1);
    d1.products.rice_pack.price = 12.5;
    assert.throws(bad(d1), EngineInputError);
    const d2 = decisionsFor(1);
    d2.products.rice_pack.price = 0;
    assert.throws(bad(d2), EngineInputError);
    assert.throws(bad(decisionsFor(1, { marketingBudget: -1 })), EngineInputError);
    const d3 = decisionsFor(1);
    d3.products.rice_pack.order = { supplierId: "market_trader", units: -5 };
    assert.throws(bad(d3), EngineInputError);
  });

  it("rejects unknown products, tiers, suppliers and segments", () => {
    assert.throws(bad(decisionsFor(1, { products: {} })), /Missing decisions/);
    const d = decisionsFor(1);
    d.products.rice_pack.qualityTier = "gold";
    assert.throws(bad(d), /quality tier/);
    const s = decisionsFor(1);
    s.products.rice_pack.order = { supplierId: "nobody", units: 5 };
    assert.throws(bad(s), /supplier/);
    assert.throws(bad(decisionsFor(1, { marketingSplit: { aliens: 1 } })), /segment/);
  });
});

describe("reference trajectories", () => {
  // Brief, Slice B acceptance: a careless team runs out of cash, a careful
  // team survives. Checked over many seeds so it is not one lucky draw.
  const seeds = Array.from({ length: 20 }, (_, i) => `traj-${i}`);

  it("a careful team survives all six periods and ends with more cash than it started", () => {
    for (const s of seeds) {
      const outs = runCareful(s, `c-${s}`);
      assert.equal(outs.length, 6);
      assert.ok(outs.every((o) => o.outcomes.status === "operating"), `seed ${s}`);
      assert.ok(outs[5].outcomes.closingCash > scenario.startingCapital.value, `seed ${s}`);
    }
  });

  it("a careless team runs out of cash, and the signals said why along the way", () => {
    for (const s of seeds) {
      const outs = simulate({ scenario, simulationId: s, cohortId: `c-${s}`, strategy: careless });
      const out = outs.findIndex((o) => o.outcomes.status === "cash_out");
      assert.ok(out >= 1 && out <= 4, `seed ${s}: cash-out in period ${out + 1}`);
      const codes = outs.slice(0, out + 1).flatMap((o) => o.learningSignals.map((x) => x.code));
      assert.ok(codes.includes("PRICE_BELOW_COST"));
      assert.ok(codes.includes("CASH_OUT"));
    }
  });

  it("trajectories are not trivial: sales, customers and cash all move over time", () => {
    const outs = runCareful();
    const distinct = (xs: number[]) => new Set(xs).size;
    assert.ok(distinct(outs.map((o) => o.outcomes.unitsSold)) >= 4);
    assert.ok(distinct(outs.map((o) => o.outcomes.customers)) >= 4);
    assert.ok(distinct(outs.map((o) => o.outcomes.closingCash)) === 6);
  });
});

describe("explainability", () => {
  it("every profit figure can be traced from the stored output", () => {
    const o = runCareful()[2];
    const line = o.explanation.find((l) => l.metric === "profit")!;
    assert.match(line.text, /Profit .* = revenue .* − variable costs .* − fixed costs/);
    for (const c of [...o.outcomes.variableCostLines, ...o.outcomes.fixedCostLines]) {
      assert.ok(o.explanation.some((l) => l.id === c.explainId), c.label);
    }
  });

  it("noise is cited by stream and draw, so 'we were unlucky' can be checked", () => {
    const o = runCareful()[0];
    const demand = o.explanation.filter((l) => l.metric === "demand");
    assert.ok(demand.length > 0);
    for (const l of demand) assert.equal(l.inputs.rng?.length, 1);
  });

  it("student views drop lecturer-only lines and any reference to them", () => {
    const o = runCareful()[0];
    const secret = { ...o.explanation[0], id: "p1.rapport.1", visibility: "lecturer" as const, text: "hidden" };
    const tampered: PeriodOutput = {
      ...o,
      explanation: [...o.explanation, secret, { ...o.explanation[1], id: "p1.x.99", inputs: { lines: ["p1.rapport.1"] } }],
    };
    const view = studentView(tampered);
    const json = JSON.stringify(view);
    assert.doesNotMatch(json, /p1\.rapport\.1|hidden/);
    assert.ok(!("newState" in view));
  });
});
