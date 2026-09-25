import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recapTeaser, recapWeeks, weekLabel, weeklyRecap, weekStartOf, type RecapInput } from "./recap.ts";
import type { ActivityEvent, EvidenceItem, Interview, PrototypeTest } from "./types.ts";

// Wednesday 23 Sep 2026; the week runs Mon 21 – Sun 27 Sep.
const NOW = new Date("2026-09-23T12:00:00Z");
const MON = new Date("2026-09-21T00:00:00Z");

let n = 0;
const id = () => `id-${++n}`;

function interview(p: Partial<Interview> = {}): Interview {
  return {
    id: id(),
    studentId: "s1",
    authorName: "Ama",
    evidenceItemId: null,
    intervieweeProfile: "Trader",
    segment: "",
    location: "Kotokuraba",
    conductedOn: null,
    channel: "in person",
    consent: true,
    keyQuotes: "",
    pains: "",
    currentSolution: "",
    spendSignal: "",
    wouldPay: "maybe",
    painLevel: null,
    surprise: "",
    createdAt: "2026-09-22T10:00:00Z",
    ...p,
  };
}

function note(p: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: id(),
    ventureId: "v",
    studentId: "s2",
    title: "Count",
    content: "",
    sourceType: "observation",
    classification: "fact",
    photoData: null,
    photoMime: null,
    hasPhoto: false,
    observedAt: null,
    locationContext: null,
    createdAt: "2026-09-22T10:00:00Z",
    updatedAt: "2026-09-22T10:00:00Z",
    authorName: "Kofi",
    ...p,
  };
}

function test(p: Partial<PrototypeTest> = {}): PrototypeTest {
  return {
    id: id(),
    prototypeId: "p",
    evidenceItemId: null,
    testerProfile: "",
    task: "",
    observed: "",
    quote: "",
    outcome: "succeeded",
    wouldPay: "yes",
    authorName: "Esi",
    createdAt: "2026-09-22T10:00:00Z",
    ...p,
  };
}

function event(eventType: string, createdAt = "2026-09-22T10:00:00Z", studentId: string | null = "s1"): ActivityEvent {
  return { id: id(), studentId, groupId: "g", ventureId: "v", eventType, entityType: null, entityId: null, metadata: null, createdAt };
}

const empty = (): RecapInput => ({ crewName: "Group 14", activity: [], interviews: [], prototypeTests: [], evidence: [] });

describe("weeks", () => {
  it("starts on Monday in UTC, whatever day it is", () => {
    assert.equal(weekStartOf(new Date("2026-09-27T23:59:00Z")).toISOString(), MON.toISOString());
    assert.equal(weekStartOf(new Date("2026-09-21T00:00:00Z")).toISOString(), MON.toISOString());
    assert.equal(weekStartOf(new Date("2026-09-28T00:00:00Z")).toISOString(), "2026-09-28T00:00:00.000Z");
  });

  it("labels a week within a month and across two", () => {
    assert.equal(weekLabel(MON), "21–27 Sep");
    assert.equal(weekLabel(new Date("2026-09-28T00:00:00Z")), "28 Sep – 4 Oct");
  });

  it("lists weeks from the first recorded act to now, newest first", () => {
    const input = { ...empty(), activity: [event("GROUP_CREATED", "2026-09-08T09:00:00Z")] };
    assert.deepEqual(
      recapWeeks(input, NOW).map((d) => d.toISOString().slice(0, 10)),
      ["2026-09-21", "2026-09-14", "2026-09-07"],
    );
    assert.equal(recapWeeks(empty(), NOW).length, 1);
  });
});

describe("weeklyRecap", () => {
  it("counts only this week, and doesn't double-count interview records as notes", () => {
    const linked = note({ id: "ev-1", locationContext: "Science Market" });
    const r = weeklyRecap(
      {
        ...empty(),
        interviews: [
          interview({ evidenceItemId: "ev-1" }),
          interview({ location: " kotokuraba ", studentId: "s3" }),
          interview({ createdAt: "2026-09-18T10:00:00Z" }),
        ],
        evidence: [linked, note(), note({ createdAt: "2026-09-28T00:00:00Z" })],
        prototypeTests: [test()],
      },
      MON,
      NOW,
    );
    assert.equal(r.interviews, 2);
    assert.equal(r.notes, 1);
    assert.equal(r.tests, 1);
    assert.deepEqual(r.places, ["Kotokuraba", "Science Market"]);
    assert.equal(r.peopleInField, 3);
    assert.equal(r.inProgress, true);
  });

  it("only quotes interviews given with consent", () => {
    const r = weeklyRecap(
      {
        ...empty(),
        interviews: [
          interview({ consent: false, keyQuotes: "Private words that must not be shared", createdAt: "2026-09-23T09:00:00Z" }),
          interview({ keyQuotes: "“I pay GH₵20 a week just to get to lectures on time.”\nSecond line" }),
        ],
      },
      MON,
      NOW,
    );
    assert.equal(r.quote, "I pay GH₵20 a week just to get to lectures on time.");
  });

  it("clips long quotes on a word boundary", () => {
    const long = "word ".repeat(60);
    const r = weeklyRecap({ ...empty(), interviews: [interview({ keyQuotes: long })] }, MON, NOW);
    assert.ok(r.quote && r.quote.length <= 140 && r.quote.endsWith("…"));
    assert.ok(!r.quote?.includes("wor…"));
  });

  it("lists big moments once each, in order, and leaves lecturer acts out of the crew's count", () => {
    const r = weeklyRecap(
      {
        ...empty(),
        activity: [
          event("DECISION_RATIFIED", "2026-09-24T10:00:00Z"),
          event("PROTOTYPE_CREATED", "2026-09-22T10:00:00Z"),
          event("PROTOTYPE_CREATED", "2026-09-23T10:00:00Z"),
          event("FEEDBACK_GIVEN", "2026-09-23T10:00:00Z", null),
          event("INTERVIEW_LOGGED"),
        ],
      },
      MON,
      NOW,
    );
    assert.deepEqual(r.moments, ["Built a prototype", "Made the big decision"]);
    assert.equal(r.actions, 4);
  });

  it("picks a persona from what the crew did", () => {
    const five = Array.from({ length: 5 }, () => interview());
    assert.equal(weeklyRecap({ ...empty(), interviews: five }, MON, NOW).persona.key, "street");
    assert.equal(weeklyRecap({ ...empty(), prototypeTests: [test(), test(), test()] }, MON, NOW).persona.key, "makers");
    assert.equal(weeklyRecap({ ...empty(), evidence: [note()] }, MON, NOW).persona.key, "warming");
  });

  it("never shames a quiet week", () => {
    const now = weeklyRecap(empty(), MON, NOW);
    const past = weeklyRecap(empty(), new Date("2026-09-14T00:00:00Z"), NOW);
    assert.equal(now.persona.title, "Blank Page");
    assert.equal(past.persona.title, "A Quiet Week");
    assert.equal(past.inProgress, false);
    assert.equal(recapTeaser(past), "");
  });

  it("sums up in one line for Today", () => {
    const r = weeklyRecap({ ...empty(), interviews: [interview(), interview({ location: "Amamoma" })], evidence: [note()] }, MON, NOW);
    assert.equal(recapTeaser(r), "2 interviews · 1 note · 2 places");
  });
});
