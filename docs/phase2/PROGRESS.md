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
