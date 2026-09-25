import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stageProgress, stageCriteria, currentStage, STAGES, type StageInput } from "./stages.ts";

const blank = (): StageInput => ({
  inGroup: false,
  activeMembers: 0,
  mySubmitted: false,
  submittedCount: 0,
  myPreference: false,
  hasVenture: false,
  assumptions: 0,
  criticalAssumptions: 0,
  evidence: 0,
  linkedAssumptions: 0,
  interviews: 0,
  interviewersMissing: [],
  interviewsPerMember: 2,
  interviewLinkedToAssumption: false,
  canvasBlocksFilled: 0,
  canvasBlocksEvidenced: 0,
  feasibilityLenses: 0,
  feasibilityLensesEvidenced: 0,
  hasFinanceModel: false,
  financePriceEvidenced: false,
  financeCostsSourcedShare: 0,
  financeBreakEven: false,
  prototypes: 0,
  prototypeTests: 0,
  minPrototypeTests: 5,
  decisionRatified: false,
  myDecideReflection: false,
  myPeerRatingsDone: false,
  planSectionsWritten: [],
});

describe("stageProgress", () => {
  it("has eleven stops in order", () => {
    assert.equal(STAGES.length, 11);
    assert.deepEqual(STAGES.map((s) => s.stop), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("starts with only team open, everything after locked", () => {
    const p = stageProgress(blank());
    assert.equal(p[0].state, "current");
    assert.ok(p.slice(1).every((x) => x.state === "locked"));
  });

  it("opens every venture stop once a venture exists, recommending the first unfinished", () => {
    const p = stageProgress({
      ...blank(),
      inGroup: true,
      activeMembers: 5,
      mySubmitted: true,
      submittedCount: 5,
      myPreference: true,
      hasVenture: true,
    });
    assert.equal(p.find((x) => x.id === "choose")?.state, "done");
    assert.equal(currentStage(p)?.id, "assume");
    assert.equal(p.find((x) => x.id === "pitch")?.state, "open");
  });

  it("sets the interview target from group size, with a floor of five", () => {
    const small = stageCriteria("listen", { ...blank(), activeMembers: 2, interviews: 4 });
    assert.equal(small[0].met, false);
    assert.match(small[0].detail ?? "", /4 of 5/);
    const big = stageCriteria("listen", { ...blank(), activeMembers: 10, interviews: 20 });
    assert.equal(big[0].met, true);
  });

  it("names members who have not interviewed anyone", () => {
    const c = stageCriteria("listen", { ...blank(), activeMembers: 3, interviews: 6, interviewersMissing: ["Kofi"] });
    assert.equal(c[1].met, false);
    assert.match(c[1].detail ?? "", /Kofi/);
  });
});
