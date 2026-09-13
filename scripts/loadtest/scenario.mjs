import { signup, call, runBatched, summarize } from "./client.mjs";

const TOTAL_STUDENTS = Number(process.argv[2] ?? 2000);
const CONCURRENCY = Number(process.argv[3] ?? 300);
const STRESS_GROUPS = 20; // groups deliberately over-subscribed: 15 racers for 9 open slots
const STRESS_GROUP_SIZE = 15; // 1 creator + 14 joiners racing for 9 remaining slots (capacity 10)
const NORMAL_GROUP_SIZE = 10;

const stressStudents = STRESS_GROUPS * STRESS_GROUP_SIZE;
const remaining = TOTAL_STUDENTS - stressStudents;
const normalGroups = Math.floor(remaining / NORMAL_GROUP_SIZE);
const usedStudents = stressStudents + normalGroups * NORMAL_GROUP_SIZE;

console.log(`Plan: ${TOTAL_STUDENTS} students requested, ${usedStudents} used`);
console.log(`  ${STRESS_GROUPS} stress groups x ${STRESS_GROUP_SIZE} racers (9 slots open after creator)`);
console.log(`  ${normalGroups} normal groups x ${NORMAL_GROUP_SIZE}`);

const report = { phases: {} };

function record(phase, res) {
  report.phases[phase] = summarize(phase, res);
  return res;
}

// ------------------------------------------------------------- 0. warm-up
// Vite's dev server transforms each server function's module graph lazily,
// on its first-ever hit — hitting that cold path for the first time under
// 2000-way concurrency produced a transient "Invalid server function ID"
// once during script development. That's a dev-tooling artifact (a real
// bundled deploy has no such cold path), not something this load test is
// meant to measure, so warm every endpoint once, sequentially, first.
async function retry(fn, attempts = 5, delayMs = 400) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

console.log("warming up server function modules...");
const warmupCookie = await signup(`warmup-${Date.now()}@example.test`, "correct horse battery staple", "Warmup");
const offeringsList = await retry(() => call("listOfferings", warmupCookie, undefined, "GET"));
const warmupOffering = offeringsList[0]?.id;
await call("upsertProfile", warmupCookie, {
  fullName: "Warmup",
  indexNumber: `WARMUP-${Date.now()}`,
  programme: "Test",
  offeringId: warmupOffering,
}).catch(() => {});
await call("getWorkspace", warmupCookie, undefined, "GET").catch(() => {});
await call("createGroup", warmupCookie, { groupName: "Warmup Group" }).catch(() => {});
await call("upsertOpportunity", warmupCookie, { submit: false, fields: {} }).catch(() => {});
await call("recordPreference", warmupCookie, { opportunityId: "warmup", rationale: "x" }).catch(() => {});
await call("createVenture", warmupCookie, { opportunityId: "warmup", name: "x", selectionRationale: "x".repeat(40) }).catch(() => {});
await call("createEvidence", warmupCookie, { title: "x", content: "x", sourceType: "observation", classification: "unknown" }).catch(() => {});
await call("createAssumption", warmupCookie, { statement: "x", importance: "critical", confidence: "low" }).catch(() => {});
console.log("warm-up done\n");

// ---------------------------------------------------------------- 1. signup
const t0 = Date.now();
const students = Array.from({ length: usedStudents }, (_, i) => i);
const signupResults = record(
  "signup",
  await runBatched(students, CONCURRENCY, async (i) => {
    const email = `student-${Date.now()}-${i}@example.test`;
    const cookie = await signup(email, "correct horse battery staple", `Student ${i}`);
    return { i, cookie };
  }),
);
console.log(`signup wall time: ${Date.now() - t0}ms`);

const actors = signupResults.filter((r) => r.ok).map((r) => r.value);
if (actors.length < usedStudents) {
  console.log(`WARNING: only ${actors.length}/${usedStudents} signups succeeded — trimming plan to what we have`);
}

// -------------------------------------------------------- 2. get offering id
const off = await call("listOfferings", actors[0].cookie, undefined, "GET");
const offeringId = off[0]?.id;
console.log("offeringId:", offeringId);

// ------------------------------------------------------------ 3. onboarding
const t1 = Date.now();
record(
  "upsertProfile",
  await runBatched(actors, CONCURRENCY, (a) =>
    call("upsertProfile", a.cookie, {
      fullName: `Student ${a.i}`,
      indexNumber: `IDX-${Date.now()}-${a.i}`,
      programme: ["Computer Science", "Business Administration", "Economics", "Agriculture", "Physics"][a.i % 5],
      offeringId,
    }),
  ),
);
console.log(`upsertProfile wall time: ${Date.now() - t1}ms`);

// --------------------------------------------------------- 4. group shaping
let cursor = 0;
const stressGroupSets = [];
for (let g = 0; g < STRESS_GROUPS; g++) {
  stressGroupSets.push(actors.slice(cursor, cursor + STRESS_GROUP_SIZE));
  cursor += STRESS_GROUP_SIZE;
}
const normalGroupSets = [];
for (let g = 0; g < normalGroups; g++) {
  normalGroupSets.push(actors.slice(cursor, cursor + NORMAL_GROUP_SIZE));
  cursor += NORMAL_GROUP_SIZE;
}

// --------------------------------------------------- 5. create every group
const t2 = Date.now();
const allGroupSets = [...stressGroupSets, ...normalGroupSets];
const creations = record(
  "createGroup",
  await runBatched(allGroupSets, CONCURRENCY, async (members, gi) => {
    const creator = members[0];
    const res = await call("createGroup", creator.cookie, { groupName: `Group ${gi}` });
    return { gi, joinCode: res.joinCode, groupId: res.groupId, members };
  }),
);
console.log(`createGroup wall time: ${Date.now() - t2}ms`);
const groups = creations.filter((r) => r.ok).map((r) => r.value);

// ------------------------------------- 6. concurrent joins — the race test
// For each group, every non-creator member calls joinGroup AT THE SAME TIME
// (Promise.all within the group), while groups themselves also run
// concurrently against each other. Stress groups intentionally send MORE
// join attempts than open slots to probe the capacity check for a
// check-then-insert race.
const t3 = Date.now();
const joinOutcomes = [];
await runBatched(groups, CONCURRENCY, async (group) => {
  const joiners = group.members.slice(1);
  const results = await Promise.allSettled(
    joiners.map((m) => call("joinGroup", m.cookie, { joinCode: group.joinCode })),
  );
  group.activeMembers = [group.members[0], ...joiners.filter((_, i) => results[i].status === "fulfilled")];
  joinOutcomes.push({ group, results });
});
const joinWallTime = Date.now() - t3;
console.log(`joinGroup wall time: ${joinWallTime}ms`);

let totalJoinAttempts = 0;
let totalJoinSuccess = 0;
let totalJoinFullRejects = 0;
let totalJoinOtherErrors = 0;
const overCapacityGroups = [];
for (const { group, results } of joinOutcomes) {
  totalJoinAttempts += results.length;
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const fullRejects = results.filter(
    (r) => r.status === "rejected" && /full/i.test(r.reason?.message ?? ""),
  ).length;
  const otherErrors = results.length - succeeded - fullRejects;
  totalJoinSuccess += succeeded;
  totalJoinFullRejects += fullRejects;
  totalJoinOtherErrors += otherErrors;
  const finalMemberCount = succeeded + 1; // + creator
  if (finalMemberCount > 10) {
    overCapacityGroups.push({ groupId: group.groupId, joinCode: group.joinCode, finalMemberCount, attempted: results.length });
  }
}
console.log(`\n[joinGroup] ${totalJoinSuccess} succeeded, ${totalJoinFullRejects} correctly rejected as FULL, ${totalJoinOtherErrors} other errors (of ${totalJoinAttempts} attempts)`);
if (overCapacityGroups.length > 0) {
  console.log(`*** CAPACITY RACE BUG CONFIRMED: ${overCapacityGroups.length} group(s) exceeded capacity 10 ***`);
  for (const g of overCapacityGroups.slice(0, 10)) {
    console.log(`  group ${g.groupId} (code ${g.joinCode}): ${g.finalMemberCount} members from ${g.attempted} concurrent join attempts`);
  }
} else {
  console.log("No group exceeded its configured capacity — capacity enforcement held under concurrency.");
}
report.phases.joinGroup = {
  totalJoinAttempts,
  totalJoinSuccess,
  totalJoinFullRejects,
  totalJoinOtherErrors,
  overCapacityGroups,
};

// Independently verify final membership count per group via getWorkspace
// (rather than trusting our own client-side tally), for the stress groups.
const verifyResults = await runBatched(stressGroupSets.map((_, gi) => gi), 10, async (gi) => {
  const creatorCookie = groups.find((g) => g.gi === gi)?.members[0].cookie;
  if (!creatorCookie) return null;
  const ws = await call("getWorkspace", creatorCookie, undefined, "GET");
  return { gi, activeMembers: ws.members.filter((m) => m.membershipStatus === "active").length, capacity: ws.group?.capacity };
});
console.log("\nServer-verified stress-group membership counts:");
for (const r of verifyResults) {
  if (r.ok && r.value) console.log(`  group ${r.value.gi}: ${r.value.activeMembers}/${r.value.capacity} active members (server-reported)`);
}

// -------------------------------------------------- 7. opportunity submission
// Every active member of every group submits their own opportunity, all at
// once — the required-fields path plus the per-student unique-opportunity
// constraint, under real concurrency.
const allActive = groups.flatMap((g) => g.activeMembers.map((m) => ({ ...m, groupId: g.groupId })));
const t4 = Date.now();
record(
  "upsertOpportunity",
  await runBatched(allActive, CONCURRENCY, (m) =>
    call("upsertOpportunity", m.cookie, {
      submit: true,
      fields: {
        problem: `Problem observed by student ${m.i}: campus service gap.`,
        affectedPeople: "Students in the affected hall/context.",
        context: "Hostel / halls",
        observedEvidence: "Observed directly over three days with counts and timings.",
        currentAlternatives: "Informal workarounds students already use.",
        whyItMatters: "Costs students time and money every week.",
        possibleSolution: "A lightweight, student-run coordination mechanism.",
        potentialCustomer: "Affected students themselves.",
        revenueMechanism: "Small optional contribution — unverified.",
        uncertainties: "Whether the relevant authority would cooperate.",
      },
    }),
  ),
);
console.log(`upsertOpportunity wall time: ${Date.now() - t4}ms`);

// ----------------------------------------------------- 8. selection: prefs
// Confirm the group state machine actually reached selection_ready for a
// sample of groups (every active member submitted).
const sampleCheck = groups.slice(0, 5);
for (const g of sampleCheck) {
  const ws = await call("getWorkspace", g.activeMembers[0].cookie, undefined, "GET");
  console.log(
    `group ${g.gi}: status=${ws.group?.status} submitted=${ws.submissionProgress.submitted}/${ws.submissionProgress.required} opportunitiesVisible=${ws.visibleOpportunities.length}`,
  );
}

const t5 = Date.now();
record(
  "recordPreference",
  await runBatched(groups, CONCURRENCY, async (g) => {
    // Everyone needs to see the opportunities to pick one — fetch once per
    // member, concurrently, then every member records a preference for the
    // first visible non-draft opportunity, all at once.
    const results = await Promise.allSettled(
      g.activeMembers.map(async (m) => {
        const ws = await call("getWorkspace", m.cookie, undefined, "GET");
        const target = ws.visibleOpportunities.find((o) => o.status !== "draft");
        if (!target) throw new Error("no visible opportunity to prefer");
        return call("recordPreference", m.cookie, {
          opportunityId: target.id,
          rationale: `Student ${m.i} prefers this because the evidence looked strongest.`,
        });
      }),
    );
    const fails = results.filter((r) => r.status === "rejected");
    if (fails.length) throw new Error(`group ${g.gi}: ${fails.length}/${results.length} preference calls failed (${fails[0].reason?.message})`);
    return true;
  }),
);
console.log(`recordPreference wall time: ${Date.now() - t5}ms`);

// --------------------------------------- 9. venture creation — the 2nd race
// For a subset of groups, TWO members call createVenture at the exact same
// time — the group must end up with exactly one venture, and the loser must
// get a clean error, not a crash or a duplicate venture.
const RACE_VENTURE_GROUPS = 15;
const t6 = Date.now();
const ventureRaceResults = await runBatched(groups.slice(0, RACE_VENTURE_GROUPS), CONCURRENCY, async (g) => {
  const ws = await call("getWorkspace", g.activeMembers[0].cookie, undefined, "GET");
  const target = ws.visibleOpportunities.find((o) => o.status !== "draft");
  const racers = g.activeMembers.slice(0, 2);
  const results = await Promise.allSettled(
    racers.map((m) =>
      call("createVenture", m.cookie, {
        opportunityId: target.id,
        name: `Venture for group ${g.gi}`,
        selectionRationale: "Chosen over the alternatives because the evidence was clearest and the customer was concrete, not assumed.",
      }),
    ),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason?.message);
  return { gi: g.gi, succeeded, errors };
});
console.log(`\nventure-creation race wall time: ${Date.now() - t6}ms (${RACE_VENTURE_GROUPS} groups x 2 simultaneous racers)`);
let doubleVentureBug = 0;
let crashedInsteadOfCleanError = 0;
for (const r of ventureRaceResults) {
  if (r.ok) {
    const { gi, succeeded, errors } = r.value;
    if (succeeded !== 1) {
      doubleVentureBug++;
      console.log(`  *** group ${gi}: ${succeeded} venture creations succeeded (expected exactly 1) ***`);
    }
    const messyErrors = errors.filter(
      (e) => e && !/already has a venture|not in selection|cannot be selected/i.test(e),
    );
    if (messyErrors.length) {
      crashedInsteadOfCleanError++;
      console.log(`  group ${gi}: unclean error on the losing racer: ${messyErrors[0]}`);
    }
  } else {
    console.log(`  group check failed entirely: ${r.error?.message}`);
  }
}
console.log(
  doubleVentureBug === 0
    ? "No group ended up with more than one venture from simultaneous createVenture calls."
    : `*** ${doubleVentureBug} group(s) show a double-venture race bug ***`,
);
console.log(
  crashedInsteadOfCleanError === 0
    ? "The losing racer always got a clean, expected error message."
    : `*** ${crashedInsteadOfCleanError} group(s) gave the losing racer a confusing/unhandled error ***`,
);
report.phases.ventureRace = { doubleVentureBug, crashedInsteadOfCleanError, groups: RACE_VENTURE_GROUPS };

// Remaining groups (past the race sample): one clean createVenture each, so
// evidence/assumptions has somewhere to attach to.
const t7 = Date.now();
record(
  "createVenture (remaining groups)",
  await runBatched(groups.slice(RACE_VENTURE_GROUPS), CONCURRENCY, async (g) => {
    const ws = await call("getWorkspace", g.activeMembers[0].cookie, undefined, "GET");
    const target = ws.visibleOpportunities.find((o) => o.status !== "draft");
    return call("createVenture", g.activeMembers[0].cookie, {
      opportunityId: target.id,
      name: `Venture for group ${g.gi}`,
      selectionRationale: "Chosen over the alternatives because the evidence was clearest and the customer was concrete, not assumed.",
    });
  }),
);
console.log(`createVenture (remaining) wall time: ${Date.now() - t7}ms`);

// --------------------------------------------------- 10. evidence + assumptions
// Every active member of every group logs one evidence item and one
// assumption, concurrently, then links them.
const t8 = Date.now();
record(
  "createEvidence",
  await runBatched(allActive, CONCURRENCY, (m) =>
    call("createEvidence", m.cookie, {
      title: `Observation by student ${m.i}`,
      content: "Logged directly during the load test, three timed observations.",
      sourceType: "observation",
      classification: "unknown",
    }),
  ),
);
console.log(`createEvidence wall time: ${Date.now() - t8}ms`);

const t9 = Date.now();
record(
  "createAssumption",
  await runBatched(allActive, CONCURRENCY, (m) =>
    call("createAssumption", m.cookie, {
      statement: `Assumption from student ${m.i}: the target users will actually adopt this.`,
      importance: "critical",
      confidence: "low",
    }),
  ),
);
console.log(`createAssumption wall time: ${Date.now() - t9}ms`);

console.log(`\nTOTAL WALL TIME: ${Date.now() - t0}ms`);
console.log("\n=== REPORT SUMMARY ===");
console.log(JSON.stringify(report, (_, v) => (v instanceof Error ? v.message : v), 2).slice(0, 6000));
