import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDecisions, cedisToPesewas, initialForm, pesewasToCedisText } from "./form.ts";

describe("decision form", () => {
  it("parses cedis to exact pesewas without floating point", () => {
    assert.equal(cedisToPesewas("25"), 2500);
    assert.equal(cedisToPesewas("25.5"), 2550);
    assert.equal(cedisToPesewas(" 1,250.05 "), 125005);
    assert.equal(cedisToPesewas("0.10"), 10);
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.", ".5"]) assert.equal(cedisToPesewas(bad), null, bad);
  });

  it("round-trips pesewas to the text shown in the form", () => {
    assert.equal(pesewasToCedisText(2550), "25.50");
    assert.equal(pesewasToCedisText(5), "0.05");
    assert.equal(cedisToPesewas(pesewasToCedisText(123456)), 123456);
  });

  it("builds engine decisions, with zero units meaning no order", () => {
    const r = buildDecisions(
      2,
      {
        products: { rice_pack: { price: "24.00", qualityTier: "standard", supplierId: "market_trader", units: "0" } },
        marketing: "150",
        eventResponses: { "power_outage@1": "charcoal" },
      },
      { rice_pack: "Rice" },
    );
    assert.deepEqual(r, {
      ok: true,
      decisions: {
        period: 2,
        products: { rice_pack: { price: 2400, qualityTier: "standard", order: null } },
        marketingBudget: 15000,
        eventResponses: { "power_outage@1": "charcoal" },
      },
    });
  });

  it("explains every invalid field in plain words", () => {
    const r = buildDecisions(
      1,
      { products: { rice_pack: { price: "free", qualityTier: "standard", supplierId: "x", units: "lots" } }, marketing: "-1", eventResponses: {} },
      { rice_pack: "Rice" },
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.errors.length, 3);
  });

  it("starts from last period's choices", () => {
    const f = initialForm([{ id: "rice_pack" }], { qualityTier: "standard", supplierId: "market_trader", price: 2500 }, {
      period: 1,
      products: { rice_pack: { price: 2300, qualityTier: "premium", order: { supplierId: "wholesaler", units: 90 } } },
      marketingBudget: 12345,
      eventResponses: {},
    });
    assert.deepEqual(f.products.rice_pack, { price: "23.00", qualityTier: "premium", supplierId: "wholesaler", units: "90" });
    assert.equal(f.marketing, "123.45");
  });
});
