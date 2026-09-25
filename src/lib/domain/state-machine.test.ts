import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advisorAllowance,
  assumptionAfterExperiment,
  canEditOpportunity,
  canJoinGroup,
  canViewPeerOpportunities,
  eligibleVoterIds,
  endorsementsNeeded,
  evaluateGroupStatus,
  opportunityVisibleToPeer,
  journeyState,
  preferencesRevealed,
  proposalOutcome,
  riskScore,
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
    assert.equal(j.team, "current");
    assert.equal(j.idea, "todo");
  });

  it("moves to Test once assumptions exist, and marks it done after a finished experiment", () => {
    const base = { hasGroup: true, hasDraftOrOpportunity: true, hasSubmitted: true, groupStatus: "venture_created" as const, hasVenture: true, evidenceCount: 2, assumptionCount: 1 };
    assert.equal(journeyState(base).test, "current");
    assert.equal(journeyState({ ...base, experimentsDone: 1 }).test, "done");
  });
});

describe("course rule: must everyone submit?", () => {
  const base = { activeMemberCount: 10, hasVenture: false, current: "opportunity_collection" as const };
  it("with the default rule, 9 of 10 is not enough", () => {
    assert.equal(evaluateGroupStatus({ ...base, submittedCount: 9, requiresAllActive: true }), "opportunity_collection");
  });
  it("when the course relaxes the rule, half the group (and at least two) opens selection", () => {
    assert.equal(evaluateGroupStatus({ ...base, submittedCount: 4, requiresAllActive: false }), "opportunity_collection");
    assert.equal(evaluateGroupStatus({ ...base, submittedCount: 5, requiresAllActive: false }), "selection_ready");
  });
  it("a lecturer can open selection early once two ideas exist", () => {
    assert.equal(evaluateGroupStatus({ ...base, submittedCount: 1, requiresAllActive: true, lecturerOpened: true }), "opportunity_collection");
    assert.equal(evaluateGroupStatus({ ...base, submittedCount: 2, requiresAllActive: true, lecturerOpened: true }), "selection_ready");
  });
});

describe("independence of ideas and votes", () => {
  it("nobody joins once ideas are visible", () => {
    assert.equal(canJoinGroup("opportunity_collection"), true);
    assert.equal(canJoinGroup("selection_ready"), false);
    assert.equal(canJoinGroup("selection"), false);
    assert.equal(canJoinGroup("venture_created"), false);
  });
  it("a submitted idea can be revised while private, and is locked once peers can see it", () => {
    assert.equal(canEditOpportunity("submitted", "opportunity_collection"), true);
    assert.equal(canEditOpportunity("submitted", "selection_ready"), false);
    assert.equal(canEditOpportunity("draft", "selection"), true);
    assert.equal(canEditOpportunity("draft", "venture_created"), false);
  });
  it("votes stay sealed until every voter has voted", () => {
    assert.equal(preferencesRevealed(9, 10), false);
    assert.equal(preferencesRevealed(10, 10), true);
    assert.equal(preferencesRevealed(0, 0), false);
  });
  it("after a lecturer opens selection early, only members who submitted vote", () => {
    assert.deepEqual(eligibleVoterIds({ activeMemberIds: ["a", "b", "c"], submittedMemberIds: ["a", "c"], lecturerOpened: true }), ["a", "c"]);
    assert.deepEqual(eligibleVoterIds({ activeMemberIds: ["a", "b", "c"], submittedMemberIds: ["a", "c"], lecturerOpened: false }), ["a", "b", "c"]);
  });
});

describe("group decision", () => {
  it("one student can never decide for a group", () => {
    assert.equal(proposalOutcome({ endorse: 1, object: 0, eligible: 10, rule: "majority" }), "open");
    assert.equal(endorsementsNeeded(10, "majority"), 6);
    assert.equal(endorsementsNeeded(2, "majority"), 2);
  });
  it("passes at a strict majority, and fails as soon as a majority is impossible", () => {
    assert.equal(proposalOutcome({ endorse: 6, object: 0, eligible: 10, rule: "majority" }), "accepted");
    assert.equal(proposalOutcome({ endorse: 5, object: 4, eligible: 10, rule: "majority" }), "open");
    assert.equal(proposalOutcome({ endorse: 3, object: 5, eligible: 10, rule: "majority" }), "rejected");
  });
  it("under the 'everyone' rule one objection stops it", () => {
    assert.equal(proposalOutcome({ endorse: 9, object: 1, eligible: 10, rule: "all" }), "rejected");
    assert.equal(proposalOutcome({ endorse: 10, object: 0, eligible: 10, rule: "all" }), "accepted");
  });
});

describe("experiments and assumptions", () => {
  it("a result moves the assumption's status; confidence changes only when the student says so", () => {
    assert.deepEqual(assumptionAfterExperiment("supports", { status: "testing", confidence: "low" }, "medium"), { status: "supported", confidence: "medium" });
    assert.deepEqual(assumptionAfterExperiment("challenges", { status: "testing", confidence: "medium" }, null), { status: "challenged", confidence: "medium" });
    assert.deepEqual(assumptionAfterExperiment("inconclusive", { status: "testing", confidence: "low" }, null), { status: "testing", confidence: "low" });
  });
  it("critical + low confidence is the riskiest", () => {
    assert.ok(riskScore({ importance: "critical", confidence: "low" }) > riskScore({ importance: "critical", confidence: "high" }));
    assert.ok(riskScore({ importance: "high", confidence: "low" }) > riskScore({ importance: "low", confidence: "low" }));
  });
  it("the advisor stops at the daily allowance", () => {
    assert.deepEqual(advisorAllowance(39, 40), { allowed: true, left: 1 });
    assert.deepEqual(advisorAllowance(40, 40), { allowed: false, left: 0 });
  });
});
