import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Rng } from "./rng.ts";

describe("seeded random streams", () => {
  it("the same seed and stream give the same numbers", () => {
    const a = new Rng("seed-1").stream("demand");
    const b = new Rng("seed-1").stream("demand");
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });

  it("a different seed gives different numbers", () => {
    const a = new Rng("seed-1").stream("demand");
    const b = new Rng("seed-2").stream("demand");
    const xs = Array.from({ length: 10 }, () => a.next());
    const ys = Array.from({ length: 10 }, () => b.next());
    assert.notDeepEqual(xs, ys);
  });

  it("streams are independent: drawing from one never shifts another", () => {
    const r1 = new Rng("s");
    const r2 = new Rng("s");
    r1.stream("other").next();
    r1.stream("other").next();
    assert.equal(r1.stream("demand").next(), r2.stream("demand").next());
  });

  it("uniform draws stay in [0, 1) and average near 0.5", () => {
    const s = new Rng("u").stream("x");
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = s.next();
      assert.ok(v >= 0 && v < 1);
      sum += v;
    }
    assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01);
  });

  it("noise has mean ~0, sd ~sigma, and is bounded", () => {
    const s = new Rng("n").stream("x");
    const sigma = 0.1;
    const xs = Array.from({ length: 20000 }, () => s.noise(sigma));
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / xs.length);
    assert.ok(Math.abs(mean) < 0.005, `mean ${mean}`);
    assert.ok(Math.abs(sd - sigma) < 0.005, `sd ${sd}`);
    const bound = 2 * Math.sqrt(3) * sigma + 1e-12;
    assert.ok(xs.every((x) => Math.abs(x) <= bound));
  });

  it("every draw is logged so explanations can cite it", () => {
    const rng = new Rng("log");
    const { draw } = rng.stream("a").chance(0.5);
    assert.deepEqual(rng.draws, [draw]);
    assert.equal(draw.stream, "a");
    assert.equal(draw.index, 0);
  });
});
