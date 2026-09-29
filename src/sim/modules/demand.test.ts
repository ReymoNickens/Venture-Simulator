import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choiceWeight, conversionFactor, relativeAttractiveness, retentionFactor, utility } from "./demand.ts";

const taste = { priceSensitivity: 0.9, qualitySensitivity: 0.4, brandSensitivity: 0.3 };

describe("demand", () => {
  it("an average offer at the reference price has utility 1", () => {
    assert.equal(utility(2000, 2000, 0.5, 50, taste), 1);
  });

  it("a higher price never makes an offer more attractive", () => {
    let prev = Infinity;
    for (let price = 500; price <= 6000; price += 250) {
      const u = utility(price, 2000, 0.5, 50, taste);
      assert.ok(u <= prev);
      prev = u;
    }
  });

  it("better quality and reputation make an offer more attractive", () => {
    assert.ok(utility(2000, 2000, 0.8, 50, taste) > utility(2000, 2000, 0.5, 50, taste));
    assert.ok(utility(2000, 2000, 0.5, 80, taste) > utility(2000, 2000, 0.5, 50, taste));
  });

  it("a price-insensitive segment barely reacts to price", () => {
    const flat = { ...taste, priceSensitivity: 0.1 };
    const drop = (t: typeof taste) => utility(2000, 2000, 0.5, 50, t) - utility(3000, 2000, 0.5, 50, t);
    assert.ok(drop(flat) < drop(taste) / 5);
  });

  it("choice weights are never zero, so no offer is ever impossible", () => {
    assert.ok(choiceWeight(-10) > 0);
  });

  it("equal offers convert and retain at the base rate", () => {
    assert.equal(relativeAttractiveness(2, [2, 2]), 1);
    assert.equal(conversionFactor(1), 1);
    assert.equal(retentionFactor(1, 0.2), 1);
    assert.ok(conversionFactor(3) > 1 && conversionFactor(3) < 2);
    assert.ok(retentionFactor(0.5, 0) < retentionFactor(0.5, 0.8));
  });
});
