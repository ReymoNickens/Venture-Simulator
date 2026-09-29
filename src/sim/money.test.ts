import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson } from "./canonical.ts";
import { assertPesewas, formatGhs, toPesewas } from "./money.ts";
import { assumed, findUnsourcedParams, sourced } from "./params.ts";
import { campusFoodStall } from "./scenarios/campus-food-stall.ts";

describe("money", () => {
  it("formats pesewas as cedis without locale APIs", () => {
    assert.equal(formatGhs(0), "GHS 0.00");
    assert.equal(formatGhs(5), "GHS 0.05");
    assert.equal(formatGhs(123456789), "GHS 1,234,567.89");
    assert.equal(formatGhs(-2000), "-GHS 20.00");
  });

  it("rounds half away from zero and never returns -0", () => {
    assert.equal(toPesewas(2.5), 3);
    assert.equal(toPesewas(-2.5), -3);
    assert.ok(Object.is(toPesewas(-0.2), 0));
  });

  it("rejects fractional pesewas", () => {
    assert.throws(() => assertPesewas(1.5, "x"));
    assert.equal(assertPesewas(150, "x"), 150);
  });
});

describe("canonical JSON", () => {
  it("sorts keys at every level and normalises -0", () => {
    assert.equal(canonicalJson({ b: 1, a: { d: -0, c: [2, { z: 1, y: 2 }] } }), '{"a":{"c":[2,{"y":2,"z":1}],"d":0},"b":1}');
  });

  it("rejects non-finite numbers", () => {
    assert.throws(() => canonicalJson({ x: Number.NaN }));
  });
});

describe("parameter provenance", () => {
  it("every number in the default scenario has a source or is flagged as an assumption", () => {
    assert.deepEqual(findUnsourcedParams(campusFoodStall), []);
  });

  it("finds a parameter with neither a source nor an assumption flag", () => {
    const bad = { market: { size: { value: 100 } }, ok: assumed(1), cited: sourced(2, "GSS 2021 census") };
    assert.deepEqual(findUnsourcedParams(bad), ["market.size"]);
  });

  it("an empty source does not count as a source", () => {
    assert.deepEqual(findUnsourcedParams({ x: { value: 1, source: " " } }), ["x"]);
  });
});
