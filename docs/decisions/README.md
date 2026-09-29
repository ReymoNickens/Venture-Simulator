# Architecture Decision Records

Short records of decisions taken during Phase 2, so the reason survives the
person who made it. One file per decision: context, decision, consequences.
A decision is changed by adding a new ADR that supersedes the old one, never
by editing history.

| # | Decision | Slice |
|---|---|---|
| [0001](0001-money-in-integer-pesewas.md) | Money is integer pesewas | A |
| [0002](0002-pure-engine-in-src-sim.md) | Engine is a pure module in `src/sim/` | A |
| [0003](0003-deterministic-rng-and-arithmetic.md) | Seeded PRNG streams; only exactly-rounded arithmetic | A |
| [0004](0004-cohort-events-shared-noise-per-group.md) | Cohort events shared, customer noise per group | A |
| [0005](0005-lecturer-cohort-scoping.md) | Lecturers read-only, scoped to own cohorts; no self-granted roles | 0 |
| [0006](0006-test-discovery-and-property-tests.md) | Tests discovered by pattern; fast-check for invariants | 0 |
| [0007](0007-no-personal-data-to-ai-or-logs.md) | No personal data in AI context or logs | 0 |
| [0008](0008-hidden-rapport.md) | Hidden rapport: text-derived, bounded, excluded from grades | C (decided now) |
| [0009](0009-advisor-display-name.md) | Advisor named per cohort, discloses it is an AI | D (decided now) |
| [0010](0010-leader-election.md) | Leader election by majority, handover, lecturer override | Governance (decided now) |
| [0011](0011-cash-out-keeps-calendar.md) | Cash-out does not rewind time | D (decided now) |
