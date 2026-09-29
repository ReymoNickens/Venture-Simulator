import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freshState, ctxFor } from "../testing.ts";
import { reactCompetitors } from "./competition.ts";

const comps = freshState().competitors;
const noSales = comps.map((c) => ({ id: c.id, sold: 0, stockedOut: false }));

describe("competitor reactions", () => {
  it("a price matcher cuts its price when the venture undercuts it and is winning share", () => {
    const next = reactCompetitors(ctxFor(), comps, noSales, { avgPrice: 1800, share: 0.2, prevShare: 0.1 }, []);
    const canteen = next.find((c) => c.id === "campus_canteen")!;
    assert.equal(canteen.price, 2300); // half-way from 2800 to 1800
  });

  it("never cuts below its own cost floor", () => {
    const next = reactCompetitors(ctxFor(), comps, noSales, { avgPrice: 100, share: 0.5, prevShare: 0 }, []);
    const canteen = next.find((c) => c.id === "campus_canteen")!;
    assert.equal(canteen.price, 1760); // 1600 × 1.1
  });

  it("does not react to a venture with a negligible share", () => {
    const next = reactCompetitors(ctxFor(), comps, noSales, { avgPrice: 1800, share: 0.02, prevShare: 0 }, []);
    assert.equal(next.find((c) => c.id === "campus_canteen")!.price, 2800);
  });

  it("a new entrant becomes active only when an event brings it in", () => {
    assert.equal(comps.find((c) => c.id === "new_kiosk")!.active, false);
    const next = reactCompetitors(ctxFor(), comps, noSales, { avgPrice: 2500, share: 0, prevShare: 0 }, ["new_kiosk"]);
    assert.equal(next.find((c) => c.id === "new_kiosk")!.active, true);
  });

  it("every reaction is explained", () => {
    const ctx = ctxFor();
    reactCompetitors(ctx, comps, noSales, { avgPrice: 1800, share: 0.2, prevShare: 0.1 }, []);
    assert.ok(ctx.lines.some((l) => l.metric === "competitor_reaction" && /Campus canteen/.test(l.text)));
  });
});
