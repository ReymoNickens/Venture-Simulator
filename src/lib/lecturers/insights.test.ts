import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attentionFor, stageLabel, type GroupSignals } from "./insights.ts";

const now = new Date("2026-10-10T12:00:00Z");
const base: GroupSignals = {
  groupId: "g",
  groupName: "Group",
  groupNumber: 1,
  offeringId: "o",
  status: "venture_created",
  ventureName: "ShuttleBoard",
  members: [
    { studentId: "a", fullName: "Ama Mensah", events: 6 },
    { studentId: "b", fullName: "Yaw Boateng", events: 5 },
    { studentId: "c", fullName: "Esi Arthur", events: 4 },
  ],
  submitted: 3,
  required: 3,
  evidenceTotal: 4,
  evidenceWeak: 1,
  assumptionsTotal: 2,
  criticalUntested: 0,
  sim: { status: "operating", completedPeriod: 2, periodCount: 6, cash: 300000 },
  lastActivityAt: "2026-10-09T12:00:00Z",
  feedbackCount: 0,
};

describe("needs attention", () => {
  it("a busy group with decent evidence is on track", () => {
    assert.deepEqual(attentionFor(base, now), []);
  });

  it("flags each problem in plain words, most serious first", () => {
    const reasons = attentionFor(
      {
        ...base,
        members: [...base.members.slice(0, 2), { studentId: "c", fullName: "Esi Arthur", events: 0 }],
        evidenceTotal: 5,
        evidenceWeak: 4,
        criticalUntested: 2,
        sim: { status: "cash_out", completedPeriod: 3, periodCount: 6, cash: -1000 },
        lastActivityAt: "2026-09-30T12:00:00Z",
      },
      now,
    );
    assert.deepEqual(
      reasons.map((r) => r.text),
      [
        "Ran out of cash in week 3 of the simulation",
        "No activity for 10 days",
        "Esi has not done anything yet",
        "Most evidence is opinion or guesswork (4 of 5)",
        "2 critical assumptions have no evidence linked",
      ],
    );
  });

  it("does not call a brand-new group uneven before there is real activity", () => {
    const fresh = { ...base, members: base.members.map((m, i) => ({ ...m, events: i === 0 ? 3 : 0 })) };
    assert.ok(!attentionFor(fresh, now).some((r) => r.code === "uneven"));
  });

  it("never calls practice peers idle", () => {
    const demo = {
      ...base,
      members: [
        { studentId: "a", fullName: "Ama Mensah", events: 4 },
        { studentId: "b", fullName: "Yaw Boateng", events: 4 },
        { studentId: "c", fullName: "Esi Arthur", events: 4 },
        { studentId: "p", fullName: "Practice Peer", events: 0, synthetic: true },
      ],
    };
    assert.ok(!attentionFor(demo, now).some((r) => r.code === "uneven"));
  });

  it("notices a venture with no evidence at all", () => {
    assert.deepEqual(
      attentionFor({ ...base, evidenceTotal: 0, evidenceWeak: 0, sim: null }, now).map((r) => r.code),
      ["no_evidence"],
    );
  });

  it("describes the stage", () => {
    assert.equal(stageLabel(base), "Simulation week 3 of 6");
    assert.equal(stageLabel({ ...base, sim: null, ventureName: null, status: "opportunity_collection", submitted: 2, required: 5 }), "2 of 5 problems submitted");
  });
});
