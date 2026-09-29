import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ctxFor, scenario } from "../testing.ts";
import { runFunnel } from "./customers.ts";

const segment = scenario.segments[0];
const base = {
  productId: "rice_pack",
  segment,
  prev: { aware: 0, active: 0 },
  reputation: 50,
  marketingSpend: 0,
  marketingEffectiveness: 1,
  eventAwareness: 0,
  attractiveness: 1,
  switchingCostAdd: 0,
  demandModifier: 1,
  demandEvents: [],
};

describe("customer funnel", () => {
  it("awareness never exceeds the segment's market size", () => {
    const f = runFunnel(ctxFor(), { ...base, marketingSpend: 10_000_000 });
    assert.equal(f.aware, segment.marketSize.value);
  });

  it("customers never exceed awareness, and funnel stages never go negative", () => {
    const f = runFunnel(ctxFor(), { ...base, prev: { aware: 400, active: 300 }, marketingSpend: 20000 });
    assert.ok(f.customers <= f.aware);
    for (const v of Object.values(f)) assert.ok(v >= 0);
    assert.equal(f.retained + f.churned, 300);
  });

  it("marketing increases awareness and customers", () => {
    const none = runFunnel(ctxFor({ seed: "x" }), base);
    const some = runFunnel(ctxFor({ seed: "x" }), { ...base, marketingSpend: 20000 });
    assert.ok(some.aware > none.aware);
    assert.ok(some.customers > none.customers);
  });

  it("a less attractive offer converts fewer and keeps fewer customers", () => {
    const prev = { aware: 600, active: 200 };
    const good = runFunnel(ctxFor({ seed: "x" }), { ...base, prev, attractiveness: 1.3 });
    const bad = runFunnel(ctxFor({ seed: "x" }), { ...base, prev, attractiveness: 0.6 });
    assert.ok(bad.retained < good.retained);
    assert.ok(bad.newCustomers < good.newCustomers);
  });

  it("explains awareness, customers and demand, citing the noise draw", () => {
    const ctx = ctxFor();
    runFunnel(ctx, { ...base, marketingSpend: 5000 });
    assert.deepEqual(ctx.lines.map((l) => l.metric), ["awareness", "customers", "demand"]);
    assert.equal(ctx.lines[2].inputs.rng?.[0].stream, "demand:rice_pack:students");
  });
});
