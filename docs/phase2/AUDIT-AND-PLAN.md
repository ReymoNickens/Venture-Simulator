# Phase 2: Audit and Slice Plan

Status: **approved** ("decide the best approach and proceed"). The open questions in Part 3 were decided with the recommended defaults: see `docs/decisions/0008`–`0011`.
Baseline at `ad89f62`: typecheck clean, lint 0 errors / 1 warning, 263 tests passing (192 script + 71 app).

---

## Part 1: Audit of what exists today

**Tables** (`migrations/0002_schema.sql`). Academic: `courses`, `course_offerings` (one cohort run), `students`, `course_enrolments`, `groups` (student-chosen name, join code, capacity, status), `group_members`. Venture: `opportunities` (+ `opportunity_revisions`), `opportunity_preferences`, `ventures` (one per group), `evidence_items`, `assumptions`, `assumption_evidence` (supports / challenges). AI: `ai_advisor_sessions`, `ai_advisor_messages`. Cross-cutting: `activity_events` (append-only), `sync_conflicts` (table exists, **nothing writes to it yet**), `app_roles` / `user_roles` (a lecturer role exists with a `course_offering_id` column, **but no lecturer features use it**). IDs are text UUIDs made in app code.

**RLS** (`0003_rls.sql`, `0005_runtime_role.sql`). This part is solid. Every request runs in one transaction as a restricted `app_runtime` role, so the policies actually filter rows. `withRlsBypass()` is a small, commented escape hatch. `rls.test.ts` proves one group cannot read or write another group's data. **Three gaps matter for this phase:**
1. `app_has_privileged_role()` ignores `course_offering_id`, so **any lecturer would see every cohort**. The brief requires "lecturers only see their own cohorts." This has to be fixed before any lecturer view ships.
2. The bypass switch is a session setting that any server code can turn on. That is acceptable for student-owned rows. It is not strong enough for simulation outcomes, cash ledger and state. Those need a stronger guarantee (see ADR-003 below).
3. Server function inputs are not validated at runtime (`.validator((x) => x)`). zod is installed but unused. Simulation decisions must be validated.

**Stage state machine** (`src/lib/domain/state-machine.ts`). This is a group state machine: `forming → opportunity_collection → selection_ready → selection → venture_created`. Its tests are pure. It **ends at `venture_created`**. There is no concept of periods, deadlines or a simulation lifecycle. `journeyState()` drives the 6-step journey rail.

**Evidence and assumptions.** Both are append-only. The link table has a `relationship_type`. `assumptions.status` (open / testing / supported / challenged) exists, **but no code ever changes it**. There is no decision table, reflection table or outcome table yet.

**Offline** (`src/lib/offline/`). This uses an IndexedDB outbox. There are 5 action types, processed in creation order. Each action carries a client-generated id, which makes a replay idempotent (a replayed item is skipped, not duplicated). A failed item stays in `error` and retries on the next sync. "Simulate offline" is available for testing. There is **no conflict detection**: opportunities rely on revision rows, and everything else is append-only.

**AI advisor** (`src/lib/server/advisor.ts`). This is server-only and uses xAI `grok-4.5` (a host constraint, see DEVIATIONS §6). The system prompt is adversarial, the reply is a structured JSON challenge, and prompts and responses are stored in `ai_advisor_messages`. Findings:
- **It is not named after the lecturer. No such mechanism exists in the repo.**
- It sends **students' full names** to the model provider, which is unnecessary personal data.
- Its refusals are enforced only by the prompt, not by server checks.

**Tests.** The test runner is `node --test` with type-stripping. The test files are **listed by hand in `package.json`**, so a new test file is silently skipped unless someone remembers to add it. There is an RLS test on PGlite. There is no property-testing library. There is no end-to-end test: Playwright is installed, but it is only used by a smoke script.

**CI** (`.github/workflows/ci.yml`). It runs typecheck, lint and test on Node 22, on pushes and PRs to `main`. There is no database-backed or end-to-end job. `scripts/loadtest/` already drives about 2,000 students through real server functions, but only against dev PGlite. The README is honest about that limit.

### Items in the brief that already exist (reuse, don't rebuild)
Activity event logging (`activity_events`), the evidence and assumption ledger and links, the conflict store (`sync_conflicts`), the lecturer role and cohort hook (`user_roles.course_offering_id`), outbox idempotency via client ids, the load-test harness, group naming, and `ventures.status` (it already allows `pivoted` and `killed`).

### Items the brief assumes exist but do not
- **Elected leader, group roles, and task assignment.** Slice D's "leader submits" depends on these.
- **Advisor named after the lecturer.**
- **Personas and hidden rapport** ("keep as previously decided"). Nothing about them is recorded in this repo.
- **Any lecturer UI.**

---

## Part 2: Proposed slice plan

Each slice is merged only when it is migrated, tested, type-checked and demonstrable. Every slice report will list what changed, the tests that prove it, what is stubbed, and the commands to run it.

| Slice | Contents | Main acceptance proof |
|---|---|---|
| **0: Foundations** (small, no student-visible change) | Test runner discovers `*.test.ts` by pattern (no hand-kept list). Add `fast-check` for property tests. Add zod validation helper. Structured logger with a personal-data allowlist. **Fix lecturer cohort scoping in RLS.** Remove student names from advisor context. `docs/decisions/` ADR folder. | Regression test: a lecturer in cohort X cannot read cohort Y. Advisor context test shows no names. All existing tests still green. |
| **A: Engine core** | Pure TypeScript module `src/sim/`, with no database, network, `Math.random` or `Date` (enforced by a lint rule). Contract: `runPeriod(input) → output`. Seeded PRNG, engine version, append-only cash ledger, explanation trail. Modules for finance, demand, customers, operations, competition, events, financing and signals (thin versions at first). CLI: `npm run sim -- --seed X --periods 6`. | Property tests for every engine invariant in brief §6. Running the CLI twice gives byte-identical output (checked in CI). |
| **Group governance** (prerequisite for D) | Leader election, leader handover, member roles, tasks (assign, complete), all recorded as activity events. | RLS tests, plus a state test: only the leader can submit. |
| **B: Minimum viable venture** | Food/retail scenario as versioned configuration data. 6 periods by default (4 to 8 allowed). Full funnel, 2 to 3 reactive competitors, inventory, capacity and suppliers, 8 to 10 events with response choices. Database tables and server-side period runner. | A "careless team" fixture that runs out of cash and a "careful team" fixture that survives, both as golden tests. Period ordering tests (no skip, no double run, no out-of-order run). Clients cannot write outcome tables. |
| **C: Ghana layer** | Payments, infrastructure, informality, records quality, permits. Loan application as a multi-step process with a waiting period and possible rejection. Every parameter carries a `source` or `assumption: true` and is lecturer-editable. | A schema test rejects any parameter without a source or assumption flag. Debt invariant tests. |
| **D: Decisions and reflection** | Proposal → comment and support → leader submits → lock. Offline drafts detect divergent edits and send them to `sync_conflicts`, shown to the group, never silently merged. Decision ledger linked to evidence and assumptions. Student-written reflection with automatic prediction-versus-actual comparison. Post-mortem and pivot records. The advisor receives simulation context and **server-side refusal checks**. | End-to-end (Playwright) test: one group completes a full period through the UI. Offline conflict test. Advisor refusal test. |
| **E: Lecturer layer** | Exception-first cohort view (paginated). Group and student drill-down, with the full explanation trail and seed. Audited controls. Configurable grading weights. CSV export. | Lecturer RLS tests. Audit-log test for reopen and reset. |
| **Load test** | Real PostgreSQL in CI (not PGlite) at about 3,000 students, 300 groups and 6 periods. Results reported plainly, including failures. | A written report. |
| **F: Competencies and Venture Autopsy** | Scores derived from logged activity, each showing the activities behind it. Autopsy timeline. The student-written "what we would do differently" section. | A test that a lucky team does not out-score a team that learned well. The phase's end-to-end definition-of-done test. |

### Technical decisions I will take (each becomes a short ADR when its slice starts)
- **ADR-001: Money is integer pesewas, never floating point.** This makes "balance = sum of transactions" exact and output byte-identical.
- **ADR-002: The engine lives in `src/sim/`, not a separate package.** One build, one test runner, no workspace tooling. A lint rule forbids it from importing the database, network, random or clock modules.
- **ADR-003: Outcome, ledger and state tables are written only by a separate `app_sim_engine` database role, through one function.** `app_runtime` gets SELECT only on them. So "clients cannot write outcomes" is enforced by the database, even if the bypass switch is on.
- **ADR-004: A separate simulation state machine** (per period: `open → locked → computed → reflected`). It hangs off `venture_created`, so the existing group machine is untouched.
- **ADR-005: The period runner is idempotent and runs per group.** A unique `(simulation_id, period)` key makes a double run impossible. It is processed in small batches so Vercel request limits are not a problem.
- **ADR-006: PRNG is sfc32 seeded from a hash of `simulation_id:period:engine_version`.** Cohort events use a cohort-level seed, so all groups in a cohort get the same events. Customer noise uses the group seed.

---

## Part 3: Questions only you can answer

1. **Hidden rapport and personas.** The repo has no record of the earlier decision. Please describe it: what inputs it reads and what "persona" is based on. My recommendation is to derive it only from the text students write (for example, the formality and completeness of a loan application or supplier message), never from who the student is. The hidden effect also changes simulated results, and simulated results feed grades. So I propose it affects process outcomes (loan approval time, supplier terms) but is **excluded from the graded financial score**. Do you agree?
2. **Advisor named after the lecturer.** There is no existing mechanism for this. My default is a per-cohort setting, "Advisor display name" (for example "Dr Mensah"), edited by the lecturer. Is that right, and should the advisor say it is an AI version of the lecturer?
3. **Leader election.** My default: one vote per member, a simple majority of active members wins, the leader can hand over, and the lecturer can override. Acceptable?
4. **After running out of cash.** The calendar keeps moving. A restart or pivot continues from the current period with new capital that must itself be raised through the financing process. The team does not rewind to period 1. Acceptable?
