# Experiential Venture Platform

A progressive web app for university entrepreneurship education: groups of students go from a problem they have seen to a venture they have tested with evidence. Built for Ghanaian campuses — phone-first, low-data, offline-tolerant.

**GitHub:** [ReymoNickens/Venture-Simulator](https://github.com/ReymoNickens/Venture-Simulator)

Working name: **Experiential Venture Platform** (override with `VITE_APP_NAME`). This is not VentureForge.

> The platform gives you uncertainty, not a business.

Students independently investigate a real problem, keep that work private until the group is ready, record individual judgement before a group decision, and build an evidence record the AI advisor is allowed to challenge — not to complete.

## Journey

Students (phone-first, works offline):

1. **Team** — sign in, add an academic profile, join a group with a code (shared on WhatsApp) or start one.
2. **Your idea** — a five-step wizard for one real problem you've seen. It autosaves on the phone and is *sealed*: nobody sees it until the group is ready.
3. **Decide** — read every idea, vote privately with a reason (votes are revealed together), then one member proposes the venture and the group endorses or objects with reasons. It needs a majority (or everyone, per course).
4. **Evidence** — log what you saw, heard, counted or photographed, and classify it yourself.
5. **Assumptions** — name what must be true; a risk map shows which to test first.
6. **Test** — design a test card (we believe… / we'll check by… / we're right if…), run it, and record what you learned with evidence. Confidence changes keep their reasons.

An advisor challenges at every stage (private while you write your idea, shared with the group afterwards) with a daily question allowance. The home screen always shows **one next step**.

Lecturers join a course with its lecturer code and get a cohort dashboard (stage of every group, groups that need a nudge), a per-group view (contribution by student, ideas, votes, proposals, evidence, tests, advisor log, timeline), notes to a group, and "open comparison now" for a group whose missing members aren't coming.

Later chapters (business model, prototype, money, plan & pitch) are shown to students as "coming next" but not built.

See [docs/UX.md](docs/UX.md) for the design rationale, [docs/CONCEPT-COVERAGE.md](docs/CONCEPT-COVERAGE.md) for coverage, and [docs/DEVIATIONS.md](docs/DEVIATIONS.md) for stack differences.

## Practice team and preview lecturer

After creating a student profile, choose **Join a practice team**. Nine practice classmates have already sealed grounded campus/hostel/market problems and voted; theirs stay hidden until you seal yours. When you propose a venture they respond (two object, with reasons), so one person can walk the whole decision.

On the preview build (embedded PGLite, no `DATABASE_URL`) the lecturer code `DEMO-LECTURER` works for any course. On a real database, set `course_offerings.lecturer_invite_code` per course.

Use **Practise working offline** in the account menu to test local save and replay.

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
src/routes/          pages (landing, login, onboarding, studio journey, teach/ lecturer)
src/lib/domain/      types, state machine, next-step story, pedagogical copy
src/lib/server/      authz, mutations, decisions, experiments, lecturer, advisor, demo bootstrap
src/lib/offline/     IndexedDB, outbox, photo compression, sync
src/components/      shell, forms, advisor, ui (design-system primitives)
docs/                architecture, coverage, deviations, manual tests
```
