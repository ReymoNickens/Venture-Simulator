# 0001: Money is integer pesewas

**Context.** The brief requires "balance equals the sum of transactions" and byte-identical re-runs. Floating-point cedis (0.1 + 0.2 ≠ 0.3) break both, silently and rarely, which is the worst kind of bug in a grading system.

**Decision.** Every money value in the engine, database and API is an integer number of pesewas (GHS 1 = 100 pesewas). Conversion to "GHS 12.50" happens only when text is displayed. Unit prices that need fractions (e.g. a fee of 1.5%) are applied once and rounded to whole pesewas at the transaction line, and the rounding is part of the explanation trail.

**Consequences.** Ledger sums are exact. Every transaction amount is a safe integer, which the engine asserts. Database columns are `bigint`.
