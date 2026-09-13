# Concurrency load test

Drives real students through the app's actual server functions (no browser,
no mocking) via TanStack Start's own client RPC wire protocol, to check
behavior under real concurrency: race conditions on shared resources (group
capacity, venture creation), and how far the dev/preview stack (a single
Node process + the embedded PGlite fallback) can be pushed before it drops
requests.

## Running it

1. Start the app: `npm run dev` (port 8080).
2. Prime Vite's dev module graph — a server function's `/_serverFn/<id>` is
   only valid once some route that imports it has been crawled once in this
   process, so a raw RPC hit before that gets "Invalid server function ID":
   ```
   node scripts/loadtest/prime-routes.mjs
   ```
3. Run the scenario: `node scripts/loadtest/scenario.mjs [students] [concurrency]`
   (defaults: 2000 students, 300 concurrent in-flight requests).

`client.mjs` is the reusable RPC client (signup, server-fn calls, a
concurrency-limited batch runner); `scenario.mjs` is the actual population +
race-condition script described in the findings this produced (see the
session's report — capacity race test via `for update`-locked joins, and a
simultaneous-createVenture race, both passing; the concurrency ceiling of the
single dev process, which is a deployment-target question, not an app bug).

Only meaningful against the local dev server / PGlite fallback — a deployed
instance (Vercel + Neon) has a different concurrency profile entirely (many
isolated function invocations instead of one process; a real connection
pool instead of a single embedded engine), which this harness does not
exercise.
