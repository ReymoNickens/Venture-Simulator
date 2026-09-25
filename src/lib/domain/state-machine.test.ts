import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewPeerOpportunities,
  evaluateGroupStatus,
  opportunityVisibleToPeer,
  journeyState,
  decisionThreshold,
  evaluateProposal,
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

describe("decisionThreshold", () => {
  it("needs more than half by default", () => {
    assert.equal(decisionThreshold(10, 51), 6);
    assert.equal(decisionThreshold(9, 51), 5);
    assert.equal(decisionThreshold(3, 51), 2);
    assert.equal(decisionThreshold(2, 51), 2);
  });
  it("is never zero and never more than the group", () => {
    assert.equal(decisionThreshold(1, 51), 1);
    assert.equal(decisionThreshold(0, 51), 1);
    assert.equal(decisionThreshold(4, 100), 4);
    assert.equal(decisionThreshold(4, 500), 4);
  });
});

describe("evaluateProposal", () => {
  it("ratifies once endorsements reach the threshold", () => {
    assert.equal(
      evaluateProposal({ activeMembers: 10, endorsements: 6, objections: 4, quorumPct: 51 }),
      "ratified",
    );
  });
  it("stays open while it can still pass", () => {
    assert.equal(
      evaluateProposal({ activeMembers: 10, endorsements: 3, objections: 4, quorumPct: 51 }),
      "open",
    );
  });
  it("rejects as soon as passing is impossible", () => {
    assert.equal(
      evaluateProposal({ activeMembers: 10, endorsements: 1, objections: 5, quorumPct: 51 }),
      "rejected",
    );
  });
  it("a single proposer cannot decide for a group of ten", () => {
    assert.equal(
      evaluateProposal({ activeMembers: 10, endorsements: 1, objections: 0, quorumPct: 51 }),
      "open",
    );
  });
});
