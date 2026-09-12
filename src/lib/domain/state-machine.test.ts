import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewPeerOpportunities,
  evaluateGroupStatus,
  opportunityVisibleToPeer,
  journeyState,
} from "./state-machine.ts";

describe("evaluateGroupStatus", () => {
  it("stays forming with a single member", () => {
    assert.equal(
      evaluateGroupStatus({
        activeMemberCount: 1,
        submittedCount: 0,
        requiresAllActive: true,
        hasVenture: false,
        current: "forming",
      }),
      "forming",
    );
  });

  it("does not treat missing students as submitted", () => {
    assert.equal(
      evaluateGroupStatus({
        activeMemberCount: 10,
        submittedCount: 9,
        requiresAllActive: true,
        hasVenture: false,
        current: "opportunity_collection",
      }),
      "opportunity_collection",
    );
  });

  it("opens selection only when every active member has submitted", () => {
    assert.equal(
      evaluateGroupStatus({
        activeMemberCount: 10,
        submittedCount: 10,
        requiresAllActive: true,
        hasVenture: false,
        current: "opportunity_collection",
      }),
      "selection_ready",
    );
  });

  it("keeps venture_created once a venture exists", () => {
    assert.equal(
      evaluateGroupStatus({
        activeMemberCount: 10,
        submittedCount: 10,
        requiresAllActive: true,
        hasVenture: true,
        current: "selection",
      }),
      "venture_created",
    );
  });
});

describe("opportunity privacy", () => {
  it("hides peer opportunities before selection", () => {
    assert.equal(canViewPeerOpportunities("opportunity_collection"), false);
    assert.equal(
      opportunityVisibleToPeer("submitted", "opportunity_collection", false),
      false,
    );
  });

  it("never shows another student's draft", () => {
    assert.equal(
      opportunityVisibleToPeer("draft", "selection_ready", false),
      false,
    );
  });

  it("lets the owner see their own draft", () => {
    assert.equal(
      opportunityVisibleToPeer("draft", "forming", true),
      true,
    );
  });
});

describe("journeyState", () => {
  it("starts at join group", () => {
    const j = journeyState({
      hasGroup: false,
      hasDraftOrOpportunity: false,
      hasSubmitted: false,
      groupStatus: null,
      hasVenture: false,
      evidenceCount: 0,
      assumptionCount: 0,
    });
    assert.equal(j.group, "current");
    assert.equal(j.opportunity, "todo");
  });
});
