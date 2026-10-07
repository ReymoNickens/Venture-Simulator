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

## Look around (demo class)

The fastest way to see every screen: open `/owner`, enter
`OWNER_ACCESS_CODE`, and tap **As a student** or **As a lecturer** under
*Look around*. The first tap sets up a demo class (ENT 302 · Demo class) with
a student, a lecturer and one group of synthetic classmates. Each tap signs
you in with a one-off password. A bar on practice accounts says who you are
and has **Switch role**, which goes back to the owner page. Demo accounts use
`@tour.demo` emails (`src/lib/demo`).

## Sign-in, groups and lecturers

Students sign themselves up; lecturers have nothing to set up.

1. **Owner** opens `/owner` with `OWNER_ACCESS_CODE` and keeps the list of
   **classes** (course · programme · level · semester), which students choose
   from.
2. **Group leader** opens the app (it can be added to the home screen) and
   signs in at `/login` with a **phone number**: a 6-digit code arrives by SMS
   (Arkesel), and the first code creates the account. **Continue with Google**
   appears once Google sign-in is configured. Then they give their **details**
   once (`/onboarding`): full name, index number, programme, email, phone and
   class. On the group step they **start a group**, which makes them its
   leader, and share its **invite link** (`/join/CODE`) with **Share on
   WhatsApp** or **Copy link**.
3. **Members** open the link, sign in the same way, fill in their details and
   are added to that group. The code still works typed in by hand.
4. **One person, one group:** index numbers, emails and phone numbers are
   each unique to one student, and a student can be active in only one group
   (database indexes in `migrations/0013`, with friendly messages from the
   server first).
5. **Lecturers:** the owner adds a lecturer's name, email and classes and
   gets a login (email plus a generated password) to pass on. The lecturer
   signs in at `/login` via "Lecturer? Sign in with email and password", can
   change the password (`/lecturer/password`), and the owner can make a new
   one if it is forgotten. A lecturer sees only their classes (row-level
   security):
   - **Needs you:** groups that ran out of cash, have gone quiet for a week,
     have members who have done nothing, rely on opinion as evidence, or
     have untested critical assumptions.
   - **Group page:** who did what, the chosen problem, everyone's picks,
     evidence, assumptions, simulation weeks, activity, and **feedback** the
     group sees on Today.
   - **Activity**, and a **marks sheet** per class as an Excel file.

### SMS codes (Arkesel)

Set `ARKESEL_API_KEY` and `ARKESEL_SENDER_ID` (the approved sender name, at
most 11 characters, e.g. `ENT302`) in Vercel and redeploy. Until both are
set, codes are not texted: they wait on the owner page for 10 minutes under
*Texts are not switched on yet*, so sign-in can be tried meanwhile
(`src/lib/sms/arkesel.ts`). Each number may ask for 3 codes a minute.

To get the key: sign up at arkesel.com, add credit, request a sender ID
under *SMS → Sender IDs* (approval can take a few days), then copy the key
from *Dashboard → API Keys*.

### Google sign-in

1. In the Google Cloud console, create a project, then *APIs & Services →
   OAuth consent screen*: External, app name "ENT 302", your email.
2. *Credentials → Create credentials → OAuth client ID*: type *Web
   application*. Authorised redirect URI:
   `https://venture-simulator.vercel.app/api/auth/callback/google`.
3. Put the client ID and secret in Vercel as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` and redeploy. The button appears on `/login` by
   itself. `BETTER_AUTH_URL` must be the same public address.

## Environment

Do not put secrets in the client. Deployed apps receive:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | Postgres (Neon or Supabase) |
| `ANTHROPIC_API_KEY` | server | Advisor (never `VITE_`-prefixed) |
| `BETTER_AUTH_URL` | server | This app's public URL |
| `BETTER_AUTH_SECRET` | server | Session signing secret |
| `OWNER_ACCESS_CODE` | server | Unlocks `/owner` (classes, lecturer logins, look around). Use a long random phrase. |
| `ARKESEL_API_KEY` | server | Arkesel SMS key for sign-in codes |
| `ARKESEL_SENDER_ID` | server | Approved SMS sender name, at most 11 characters |
| `GOOGLE_CLIENT_ID` | server | Google sign-in (optional) |
| `GOOGLE_CLIENT_SECRET` | server | Google sign-in (optional) |
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
