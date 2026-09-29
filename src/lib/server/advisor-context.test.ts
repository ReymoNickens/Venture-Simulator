import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAdvisorBrief, memberLabels } from "./advisor-context.ts";

describe("advisor context brief", () => {
  const brief = formatAdvisorBrief({
    stage: "selection",
    groupStatus: "selection",
    groupName: "Team Kenkey",
    opportunities: [
      {
        authorId: "student-zz",
        status: "submitted",
        problem: "Hostel laundry queues",
        observedEvidence: "Counted 14 people waiting",
        currentAlternatives: "Hand washing",
        potentialCustomer: "Hall residents",
        uncertainties: "Water supply",
      },
      {
        authorId: "student-aa",
        status: "submitted",
        problem: "Late-night food",
        observedEvidence: "",
        currentAlternatives: "",
        potentialCustomer: "",
        uncertainties: "",
      },
    ],
    preferences: [{ authorId: "student-zz", rationale: "Saw it myself", problem: "Hostel laundry queues" }],
    venture: null,
    evidence: [],
    assumptions: [],
  });

  it("refers to authors by stable member labels, never by id", () => {
    assert.match(brief, /Member 2: Hostel laundry queues/);
    assert.match(brief, /Member 1: Late-night food/);
    assert.match(brief, /Member 2 prefers/);
    assert.doesNotMatch(brief, /student-zz|student-aa/);
  });

  it("has no field that could carry a student name", () => {
    // The input type has no name field at all; this guards against one
    // being added back to the brief by accident.
    assert.doesNotMatch(brief, /full_name|index_number|programme/i);
  });

  it("numbers members by id order, independent of the order rows arrive in", () => {
    const a = memberLabels(["b", "a", "c"]);
    const b = memberLabels(["c", "b", "a", "a"]);
    assert.deepEqual([...a.entries()], [...b.entries()]);
    assert.equal(a.get("a"), "Member 1");
  });
});
