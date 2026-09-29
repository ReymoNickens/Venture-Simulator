# 0012: Only the engine role writes outcomes

**Context.** The brief: "Clients cannot write outcome tables (enforce with RLS and tests)." Every request runs as `app_runtime` (0005). RLS alone would not be enough: the audited bypass switch (`withRlsBypass`) turns row filtering off for system operations, so a bug in any student-facing server function that ran under bypass could write a result.

**Decision** (`migrations/0008_simulation.sql`).
- A separate `app_sim_engine` role. The period runner (`src/lib/simulation/service.ts`, `asEngine()`) switches to it for its writes only, inside the same transaction, then switches back.
- `app_runtime` has **no INSERT/UPDATE/DELETE grant** on cohorts, cohort events, simulations, results or the ledger. Permissions are checked before RLS, so the bypass switch cannot help: the database answers "permission denied".
- `app_runtime` may INSERT decisions only. The RLS check requires: yourself, your group, exactly the next period, the period open, the cohort running, the venture not exited. There are no UPDATE or DELETE grants, so submitting locks the period. `unique (simulation_id, period)` makes it once per period.
- The full engine output and state are not readable by `app_runtime` (column grants). Students read `student_output`, already filtered by `studentView()`. This keeps lecturer-only lines (e.g. rapport, ADR 0008) out of every student query, not just out of the API.
- Cohort event draws are readable by lecturers only, so a fast group's draw can never spoil what a slower group will face.
- The runner locks the simulation row (`for update`), so two simultaneous submissions queue and the second finds its period already done.

**Consequences.** The protection tests in `src/lib/simulation/service.test.ts` try each forbidden write with the bypass switch on and expect "permission denied". Removing the `revoke` makes 10 of them fail. Lecturer controls (reopen, reset, inject event) in Slice E will be further engine-role operations, each audited.

**Not claimed.** The per-request connection logs in as the database owner and then runs `set role`. So SQL injection in server code could still `reset role`. That was already true before this slice (ADR 0005 context). The protection here is against logic mistakes, and every query is parameterised.
