# Experiential Venture Platform

A progressive web app for university entrepreneurship education in Ghana: students practise the whole venture process — from spotting a problem to pitching — with evidence, not just a written plan.

**GitHub:** [ReymoNickens/Venture-Simulator](https://github.com/ReymoNickens/Venture-Simulator)

Working name: **Experiential Venture Platform** (override with `VITE_APP_NAME`). This is not VentureForge.

> The platform gives you uncertainty, not a business.

Students independently investigate a real problem, keep that work private until the group is ready, record individual judgement before a group decision, and build an evidence record the AI advisor is allowed to challenge — not to complete.

## The route (student side)

Eleven stops, each with a field mission, a “done” checklist computed from the record, optional milestone, lecturer feedback and a private reflection:

1. **Team up** — create or join a group (join code, WhatsApp share, leave with a reason)
2. **Spot a problem** — individual opportunity, sealed until everyone has submitted
3. **Choose together** — compare, record your own preference first (peers’ preferences stay hidden until you do), propose, majority ratifies
4. **What must be true?** — assumption ledger with a risk grid; mark assumptions held up / broke
5. **Go and listen** — interview guide and consent script; offline interview log that becomes evidence
6. **Model the business** — canvas; every note is stamped GUESS until linked to evidence
7. **Can it work?** — four feasibility lenses, each verdict citing evidence
8. **Run the numbers** — unit economics, break-even, payback, cedi/price stress tests, sourced-cost check
9. **Build & test** — cheap prototypes and offline user tests
10. **Persevere, pivot or stop** — look-back summary, majority decision, confidential peer ratings
11. **Pitch day** — business plan assembled from the record (printable) and a pitch-slide mode

Also: **Today** (next move, deadlines, market shocks, announcements, team activity), **Notebook** (all evidence), **Advisor** (challenging AI with daily caps). Everything but the advisor works offline.

## The staff room (lecturer side, `/lecturer`)

Built for one lecturer to ~400 students — it works by exception:

- **Attention queue** — groups ranked by readable rules (stalled, blocked on named members, silent members, untested critical assumptions, opinion-heavy evidence, advisor use without fieldwork, missed milestones, unanswered shocks) and a stage funnel.
- **Group drill-down** — contribution per member, confidential peer averages, private reflections, the full record; mark a member inactive (unblocks the group), feedback with rubric levels and reusable comments, take ownership of a group.
- **Course set-up** — milestones, announcements, Ghana-grounded market shocks, CSV gradebook.

Staff join with `STAFF_ACCESS_CODE` (preview database: `DEMO-STAFF`).

## Demonstration group

After creating a student profile, open **Enter demonstration group**. Nine peers submit grounded campus/hostel/market opportunities, hidden until you submit yours. Demo peers auto-endorse group proposals (labelled) so one person can walk the whole route.

Use **Rehearse offline** (tap the connection pill) to test local save and replay.

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
| `STAFF_ACCESS_CODE` | server | Code lecturers enter to join the staff room |
| `VITE_APP_NAME` | client | Optional display name |
| Auth credentials | server | Injected by the host |

Copy [`.env.example`](.env.example) when running outside this host. Never commit a real `.env`.

## Repo map

```
migrations/          schema, RLS, catalogue seed
src/routes/          pages (landing, login, studio journey)
src/lib/domain/      types, state machine, stages, finance, flags, market events
src/lib/server/      authz, mutations, governance, venture work, lecturer, advisor
src/lib/offline/     IndexedDB, outbox, photo compression, sync
src/components/      shell, stage, forms, advisor, lecturer, ui (emblems, stamps, kente)
src/routes/lecturer/ staff room (queue, group detail, course set-up)
docs/                architecture, coverage, deviations, manual tests
```
