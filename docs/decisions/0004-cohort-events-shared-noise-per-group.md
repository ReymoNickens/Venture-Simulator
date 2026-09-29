# 0004: Cohort events are shared; customer noise is per group

**Context.** Groups must be comparable (fair to grade) but not identical (otherwise groups copy each other).

**Decision.** External events (supplier price rise, Mobile Money outage, power cuts, a new entrant...) are drawn **once per cohort per period** by `drawCohortEvents(scenario, cohortSeed, period)`, stored, and passed unchanged to every group's run. Lecturers can also inject a cohort event. Customer-behaviour noise, supplier delivery reliability and group-scoped events triggered by a group's own state (e.g. spoilage when stock is high) use the group's own seed.

**Consequences.** Every group faces the same world, and differences in outcome trace to decisions plus bounded, recorded noise. The explanation trail shows each noise draw, so "we were unlucky" can be checked rather than argued.
