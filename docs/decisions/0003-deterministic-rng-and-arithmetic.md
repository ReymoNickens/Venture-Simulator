# 0003: Seeded random streams and exactly-rounded arithmetic

**Context.** "Same engine version, scenario, state, decisions and seed must always produce identical output." Two things threaten that: the random source, and floating-point functions whose results may differ between JavaScript engines or versions.

**Decision.**
1. PRNG is **sfc32**, seeded through the **cyrb128** string hash. Both are small, well-studied and fully specified in integer arithmetic.
2. The server derives the seed as `simulationId:period` (group) and `cohortId:period` (cohort events). The client never supplies it.
3. Each module draws from its own **named stream** (`seed + "|demand:students"`, `seed + "|supplier:ama"`, ...). Adding a draw in one module therefore cannot shift another module's numbers, which keeps golden tests stable and explanations honest.
4. The engine uses only `+ - * /`, `Math.sqrt`, `Math.floor/round/min/max/abs`. These are exactly rounded under IEEE 754 and give identical bits everywhere. `Math.pow/exp/log/sin/cos` are **banned** by lint inside `src/sim/`. Demand curves are rational functions, and bell-shaped noise is Irwin-Hall (sum of uniforms), not Box-Muller.
5. Output is serialised with sorted keys (`canonicalJson`) so byte-identical comparisons are meaningful.

**Consequences.** Determinism holds across machines, not just within one process. The model is slightly less "textbook" (no exponential elasticity), which is a fair trade for guaranteed reproducibility in an assessed setting.
