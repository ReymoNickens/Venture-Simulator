# Experiential Venture Platform

Slice 1 of a progressive web app for university entrepreneurship education.

**GitHub:** [ReymoNickens/Venture-Simulator](https://github.com/ReymoNickens/Venture-Simulator)

Working name: **Experiential Venture Platform** (override with `VITE_APP_NAME`). This is not VentureForge.

> The platform gives you uncertainty, not a business.

Students independently investigate a real problem, keep that work private until the group is ready, record individual judgement before a group decision, and build an evidence record the AI advisor is allowed to challenge — not to complete.

## Journey (this slice)

1. Sign in with your student email address or index number (pre-provisioned roster; see [Sign-in](#sign-in))
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
- Claude (`claude-opus-5`) for the advisor, server-side only

The original concept named Next.js, Supabase, and Claude. Pedagogy follows the concept; runtime follows this host.

## Sign-in and class lists

There is no open self-registration. Each class keeps its own list, and the
course rep maintains it from a phone, without any database work:

1. **Owner** (whoever runs the platform) opens `/owner`, enters the
   `OWNER_ACCESS_CODE`, and makes a one-time setup code for each class
   (e.g. "BSc Business, Level 300"). The page copies a ready-made WhatsApp
   message with the link and code for the rep. Codes expire after 30 days and
   are stored only as hashes.
2. **Course rep** opens `/rep`, enters the code, names the programme and
   level, and creates their own account. They land on **Class list**
   (`/studio/class`), download the Excel template
   (`public/templates/class-list-template.xlsx`: Full name, Index number,
   Email, Programme), fill it in and upload it. Every bad row is explained by
   its Excel row number. Uploading again adds late students and fixes typos;
   anyone who has already activated is never changed. The page also copies a
   WhatsApp message telling the class how to get in.
3. **Students** activate at `/login` → "First time here? Activate your
   account" with the email and index number on their class list, plus a
   password. After that they sign in with EITHER their email or their index
   number. Index number doubles as Better Auth's `username`, matched
   case-insensitively.

A "class" is one course offering for one programme and level; groups form
within a class. The older script `node scripts/roster-import.mjs roster.csv
[courseOfferingId]` (CSV: `email,index_number,full_name,programme`) still
works for bulk loads by someone with database access. To rebuild the Excel
template after changing it, run `node scripts/make-class-template.mjs`.

## Environment

Do not put secrets in the client. Deployed apps receive:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | Postgres (Neon or Supabase) |
| `ANTHROPIC_API_KEY` | server | Advisor (never `VITE_`-prefixed) |
| `BETTER_AUTH_URL` | server | This app's public URL |
| `BETTER_AUTH_SECRET` | server | Session signing secret |
| `OWNER_ACCESS_CODE` | server | Unlocks `/owner`, where course rep setup codes are made. Use a long random phrase. |
| `VITE_APP_NAME` | client | Optional display name |

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
