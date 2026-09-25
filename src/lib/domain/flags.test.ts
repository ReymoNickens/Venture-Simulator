import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attentionScore, groupFlags, type GroupMetrics } from "./flags.ts";

const healthy = (): GroupMetrics => ({
  activeMembers: 8,
  daysSinceActivity: 1,
  silentMembers: [],
  waitingOn: [],
  waitingDays: 0,
  criticalAssumptions: 2,
  criticalUntested: 0,
  evidence: 10,
  opinionOrAssumptionEvidence: 2,
  advisorMessages7d: 4,
  fieldRecords7d: 6,
  overdueStages: [],
  unansweredShocks: 0,
});

describe("groupFlags", () => {
  it("raises nothing for a healthy group", () => {
    assert.deepEqual(groupFlags(healthy()), []);
  });

  it("flags a stalled group, high after two weeks", () => {
    const f = groupFlags({ ...healthy(), daysSinceActivity: 15 });
    assert.equal(f[0].code, "STALLED");
    assert.equal(f[0].severity, "high");
  });

  it("names members the group is blocked on", () => {
    const f = groupFlags({ ...healthy(), waitingOn: ["Kwame"], waitingDays: 8 });
    const flag = f.find((x) => x.code === "WAITING_ON_MEMBERS");
    assert.ok(flag);
    assert.equal(flag.severity, "high");
    assert.match(flag.message, /Kwame/);
  });

  it("flags opinion-heavy evidence and advisor use without fieldwork", () => {
    const f = groupFlags({
      ...healthy(),
      evidence: 5,
      opinionOrAssumptionEvidence: 4,
      advisorMessages7d: 20,
      fieldRecords7d: 0,
    });
    const codes = f.map((x) => x.code);
    assert.ok(codes.includes("OPINION_HEAVY"));
    assert.ok(codes.includes("ADVISOR_OVER_FIELDWORK"));
  });

  it("ranks overdue and blocked groups above low-severity ones", () => {
    const urgent = groupFlags({ ...healthy(), overdueStages: ["Go and listen"] });
    const minor = groupFlags({ ...healthy(), evidence: 5, opinionOrAssumptionEvidence: 5 });
    assert.ok(attentionScore(urgent) > attentionScore(minor));
  });
});
