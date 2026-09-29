# 0002: The engine is a pure module in `src/sim/`

**Context.** The brief asks for a framework-independent engine with no database or network access, suggesting `packages/sim-engine` or `src/server/sim/`.

**Decision.** `src/sim/` inside the existing app, not a separate package. It imports nothing outside `src/sim/`, uses no dependencies, and never touches `Math.random`, `Date`, `fetch`, `process` or the database. ESLint enforces this (`eslint.config.mjs`, the `src/sim` block). The server calls it; it never calls the server.

**Why not a package.** A workspace package adds a second build, a second tsconfig and publish/link tooling for no benefit at this size. The lint boundary gives the same guarantee. Moving the folder into a package later is mechanical.

**Consequences.** The same code can run in a CLI (`npm run sim`), in tests, and on the server. Engine versions are kept side by side in `src/sim/versions.ts` so a stored run can always be recomputed with the engine that produced it.
