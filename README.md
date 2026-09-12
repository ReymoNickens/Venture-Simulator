# Experiential Venture Platform

Slice 1 of a progressive web app for university entrepreneurship education.

**GitHub:** [ReymoNickens/Venture-Simulator](https://github.com/ReymoNickens/Venture-Simulator)

Working name: **Experiential Venture Platform** (override with `VITE_APP_NAME`). This is not VentureForge.

> The platform gives you uncertainty, not a business.

Students independently investigate a real problem, keep that work private until the group is ready, record individual judgement before a group decision, and build an evidence record the AI advisor is allowed to challenge — not to complete.

## Journey (this slice)

1. Sign in (Google, X, or email)
2. Academic profile (name, index number, programme) — separate from login
3. Create or join a group (join code, configurable capacity)
4. Write and submit an individual opportunity (private until selection)
5. Record a personal preference, then a group selection rationale
6. Talk to a challenging AI advisor
7. Log evidence (with classification and optional photo)
8. Log assumptions and link evidence (supports / challenges)
9. Keep working offline; sync when the network returns

Not in this slice: feasibility, finance, prototypes, lecturer dashboard, contribution scoring, business-plan generation.

See [docs/CONCEPT-COVERAGE.md](docs/CONCEPT-COVERAGE.md) for what the full concept required that a shorter prompt had dropped, and [docs/DEVIATIONS.md](docs/DEVIATIONS.md) for stack differences.

## Demonstration cohort

After creating a student profile, open **Enter demonstration cohort**. Nine peers submit grounded campus/hostel/market opportunities. Their work stays hidden until you submit yours, then selection opens.

Use **Simulate offline** in the top bar to test local save and replay.

## Stack

- TanStack Start + Vite + Tailwind
- Postgres (Neon when deployed, PGLite in preview)
- Better Auth
- xAI (`grok-4.5`) for the advisor, server-side only

The original concept named Next.js, Supabase, and Claude. Pedagogy follows the concept; runtime follows this host.

## Environment

Do not put secrets in the client. Deployed apps receive:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | Neon Postgres |
| `XAI_API_KEY` | server | Advisor (never `VITE_`-prefixed) |
| `VITE_APP_NAME` | client | Optional display name |
| Auth credentials | server | Injected by the host |

Copy [`.env.example`](.env.example) when running outside this host. Never commit a real `.env`.

## Repo map

```
migrations/          schema, RLS, catalogue seed
src/routes/          pages (landing, login, studio journey)
src/lib/domain/      types, state machine, pedagogical copy
src/lib/server/      authz, mutations, advisor, demo bootstrap
src/lib/offline/     IndexedDB, outbox, photo compression, sync
src/components/      shell, forms, advisor
docs/                architecture, coverage, deviations, manual tests
```
