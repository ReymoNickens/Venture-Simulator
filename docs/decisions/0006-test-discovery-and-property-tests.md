# 0006: Tests are discovered by pattern; invariants use property tests

**Context.** `npm test` listed test files by hand, so a new test file was silently never run. The brief's invariants ("balance equals the sum of transactions" for *any* decisions) are properties, not examples.

**Decision.** `npm test` runs every `src/**/*.test.ts` and `scripts/**/*.test.mjs`. `fast-check` (dev dependency) generates random decision sequences for engine invariants. Its seed is printed on failure so any failure is reproducible.

**Consequences.** Adding a test file is enough to run it in CI.
