import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ctxFor, decisionsFor, scenario } from "../testing.ts";
import { neutralModifiers } from "./events.ts";
import { capacityUnits, placeOrders, receiveDeliveries, sellFromStock, spoil, supplierUnitCost } from "./operations.ts";

describe("operations", () => {
  it("sells at weighted-average cost and refuses to sell stock it does not have", () => {
    const inv = { units: 10, value: 1000 };
    assert.equal(sellFromStock(inv, 4), 400);
    assert.deepEqual(inv, { units: 6, value: 600 });
    assert.throws(() => sellFromStock(inv, 7));
    assert.equal(sellFromStock(inv, 6), 600);
    assert.deepEqual(inv, { units: 0, value: 0 });
  });

  it("an immediate order is capped by the cash available to pay for it", () => {
    const ctx = ctxFor({ cash: 1200 * 5 + 500 });
    const orders = placeOrders(ctx, decisionsFor(1), neutralModifiers());
    assert.equal(orders[0].units, 5);
    assert.match(ctx.lines[0].text, /you only had cash for 5/);
  });

  it("an order is capped by supplier capacity", () => {
    const ctx = ctxFor({ cash: 100_000_000 });
    const d = decisionsFor(1);
    d.products.rice_pack.order = { supplierId: "market_trader", units: 5000 };
    assert.equal(placeOrders(ctx, d, neutralModifiers())[0].units, 800);
  });

  it("a lead-time order arrives and is paid for next period, not now", () => {
    const ctx = ctxFor({ period: 1, cash: 0 });
    const d = decisionsFor(1);
    d.products.rice_pack.order = { supplierId: "wholesaler", units: 100 };
    const orders = placeOrders(ctx, d, neutralModifiers());
    assert.equal(orders[0].arrivesPeriod, 2);
    const inventory = { rice_pack: { units: 0, value: 0 } };
    const flows = { rice_pack: { opening: 0, purchased: 0, sold: 0, spoiled: 0, closing: 0 } };
    assert.equal(receiveDeliveries(ctx, inventory, orders, flows).length, 1);
    assert.equal(ctx.transactions.length, 0);
    const next = ctxFor({ period: 2, cash: 1_000_000 });
    assert.equal(receiveDeliveries(next, inventory, orders, flows).length, 0);
    assert.ok(inventory.rice_pack.units > 0);
    assert.equal(next.transactions[0].amount, -inventory.rice_pack.value);
  });

  it("unit cost reflects the quality tier and supplier-cost events", () => {
    const m = neutralModifiers();
    assert.equal(supplierUnitCost(scenario, "market_trader", "rice_pack", "standard", m), 1200);
    assert.equal(supplierUnitCost(scenario, "market_trader", "rice_pack", "premium", m), 1560);
    m.supplierCost = 1.25;
    assert.equal(supplierUnitCost(scenario, "market_trader", "rice_pack", "standard", m), 1500);
  });

  it("capacity is reduced by events", () => {
    const m = neutralModifiers();
    m.capacity = 0.7;
    assert.equal(capacityUnits(ctxFor(), m), 490);
  });

  it("spoilage writes off a share of leftover stock, never more than there is", () => {
    const inv = { units: 100, value: 10000 };
    const s = spoil(ctxFor(), "rice_pack", inv, neutralModifiers());
    assert.equal(s.units, 30);
    assert.equal(inv.units, 70);
    const m = neutralModifiers();
    m.spoilage = 10;
    const all = { units: 5, value: 500 };
    spoil(ctxFor(), "rice_pack", all, m);
    assert.deepEqual(all, { units: 0, value: 0 });
  });
});
