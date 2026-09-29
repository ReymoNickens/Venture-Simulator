# Phase 2 progress

## Slice 0: Foundations (done)

**What changed**
- `migrations/0007_cohort_scoped_roles.sql`: lecturers are read-only and see only their own cohorts. Previously any lecturer would have had read *and write* on every cohort. `user_roles` now has RLS, so nobody can grant themselves a role.
- The advisor no longer sends student names to the AI provider (`src/lib/server/advisor-context.ts`).
- `npm test` finds test files by pattern. Previously a new test file was silently skipped unless added to a list.
- New helpers for later slices: `parseInput` (zod validation), `log` (structured logs with a personal-data allow-list), `fast-check` for property tests.
- ADRs 0001–0011 in `docs/decisions/`.

**Existing features touched, with regression tests**: RLS (the existing 8 isolation tests still pass, plus 11 new), advisor context (3 new), `AppError` moved to `src/lib/server/errors.ts` and re-exported from `authz.ts` (no call site changed).

**Proof**: `src/lib/server/rls-cohort.test.ts`. 9 of its 11 tests fail if migration 0007 is removed.

## Slice A: Simulation engine core (done)

**What changed**: a new `src/sim/` module (see `src/sim/README.md`). Nothing existing was modified apart from the lint config and `package.json`.

**What the tests prove** (`src/sim/**/*.test.ts`, 92 tests)
- Brief §6 invariants as property tests over 150 random 6-period runs each (`invariants.test.ts`): cash equals the sum of ledger transactions and the ledger is append-only; revenue equals sales lines; profit equals revenue − variable − fixed; stock never goes negative and stock flows balance; debt never disappears and repayments follow the schedule; every transaction has an explanation line. Planting a one-pesewa ledger bug or a one-pesewa repayment bug makes them fail.
- Determinism: identical output for the same inputs; different output for a different seed; the CLI run twice as separate processes prints byte-identical JSON.
- Fairness: two groups in one cohort get the same events but different customer noise.
- Ordering (engine level): cannot skip a period, re-run a period, run past the configured count, or run an exited venture. Unknown or mismatched engine versions are refused.
- Reference trajectories over 20 seeds: the "careful" team always survives six periods and ends with more cash than it started with. The "careless" team always runs out of cash in periods 2–5, and the signals flagged below-cost pricing first.
- Lint rejects `Math.random`, `Date`, `fetch`, `Math.pow/exp/log`, `**` and non-local imports inside the engine.

**Still stubbed / not yet built**
- No database tables or server functions yet (Slice B). "A period cannot run twice" is enforced by the engine's period check today; Slice B adds the database unique key and locking.
- Payment methods, infrastructure, informality, regulation and the loan application process (Slice C). The engine already accepts server-approved `financing` and models repayment.
- The hidden rapport mechanic (Slice C). The lecturer-only visibility filter already exists and is tested.
- All scenario numbers are placeholders marked `assumption: true`. A lecturer must review them before real use.

**Run it**
```
npm ci
npm run sim                          # careful team
npm run sim -- --strategy careless   # runs out of cash
npm run sim -- --explain             # full explanation trail
npm test                             # everything
```

## Slice B: Minimum viable simulated venture (done)

**What changed**
- `migrations/0008_simulation.sql`: cohort simulation settings (scenario frozen per cohort, 4–8 periods, default 6), shared cohort event draws, simulations, locked decisions, results and the cash ledger. There is a new `app_sim_engine` role, and students can no longer write outcomes at the database level (ADR 0012).
- `src/lib/simulation/service.ts`: start a simulation, submit and lock decisions, run a period exactly once, draw each cohort period's events once for every group, and give students a view of their simulation that hides the model's internal parameters.
- `src/lib/server/simulation.ts`: server functions with zod-validated input.
- `src/routes/studio/simulation.tsx`: the student screen. It follows the brief's single flow: Market → Decide & submit → Results. It always shows where you are, what you must do, cash and stock. Results include warning signs, reflection questions, the full "how every number was worked out" trail, and a table of all periods.
- Offline: a submission made offline waits in the outbox and syncs later. The screen shows "results pending". A replay of the same submission is recognised, never duplicated.
- The journey rail gains step 7, "Run the venture".
- Engine outcomes now include deliveries still on their way (`incoming`).

**Existing features touched, with regression tests**: the workspace snapshot has a new `simulation` field; the journey state machine has a new step (3 new tests; the existing ones are unchanged); the offline outbox has a new action type. The RLS, evidence, assumption and advisor code is unchanged.

**What the tests prove** (`src/lib/simulation/*.test.ts`, 33 tests, against real Postgres via PGlite with the real migrations)
- A period cannot be skipped, run twice or run out of order. A second submission for a period is refused, and an offline replay is recognised.
- Invalid decisions are refused, and nothing is stored.
- The cohort's open period and a paused cohort both block submissions.
- Clients cannot write outcomes, transactions or state. Nine forbidden writes and reads are each attempted **with the RLS bypass switch on** and get "permission denied". Removing the revoke makes 10 tests fail.
- A student cannot submit for another group or in another student's name, and cannot see another group's simulation, results, decisions or ledger.
- Lecturers see simulations in their own cohort only. Students cannot read cohort event draws directly.
- Two groups in a cohort get identical cohort events, and each cohort period is drawn exactly once.
- Re-running the engine from the stored inputs reproduces the stored output and state byte for byte.
- The form turns cedis into exact pesewas without floating-point errors.

**Checked in a real browser** (Playwright, dev server, 420 px wide phone viewport): onboarding → demonstration cohort → opportunity → preference → group decision → launch → three weeks of decide / review / submit / results, with no page errors. This found and fixed two UI bugs that unit tests could not: results not appearing after a submission, and an earlier week's details overwriting the latest week's.

**Still stubbed / not yet built**
- Any group member can submit, and the screen says so. Leader election and group discussion of proposals come in the governance step and Slice D.
- There is no prediction or reflection step yet (Slice D). The results screen asks the questions, but there is nowhere to answer them yet.
- Cash-out shows a clear message, but post-mortem, restart and pivot are Slice D.
- Lecturers cannot yet change cohort settings or pace periods from the UI (Slice E). The settings exist in the database: `period_count`, `open_through_period` and `status`.
- The browser walkthrough is a local script, not yet in CI. It becomes the automated end-to-end test in Slice D, when the full flow exists.
- Concurrency has been reasoned about (row lock plus unique keys), but PGlite cannot run truly parallel transactions. The real-Postgres load test after Slice E will cover simultaneous submissions.

**Run it**
```
npm ci
VITE_AUTH_ENABLED=false npm run dev    # http://localhost:8080, signed in as a dev user
# Onboarding -> Group: "Enter demonstration cohort" -> submit an opportunity ->
# Select: record a preference, then the group decision -> Run the venture
npm test
```
