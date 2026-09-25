# Concept coverage (Slice 1)

This build follows the full *Experiential Venture Platform — MVP Slice 1* concept, not the shorter VentureForge prompt. The thinner prompt dropped pedagogical and data-model rules that this repo restores.

Working name: **Experiential Venture Platform** (`VITE_APP_NAME`). This is not VentureForge.

## Restored from the concept (dropped by the short prompt)

| Concept rule | Where it lives |
|---|---|
| “The platform gives you uncertainty, not a business.” | [`src/lib/brand.ts`](../src/lib/brand.ts), landing, advisor system prompt |
| Academic identity is not the login account | `students` table; onboarding after Better Auth |
| `courses` + `course_offerings` (code is not identity) | [`migrations/0002_schema.sql`](../migrations/0002_schema.sql), [`0004_seed.sql`](../migrations/0004_seed.sql) |
| Configurable default group size (10) | `course_offerings.default_group_size` |
| Join codes; group capacity | `groups.join_code`, `groups.capacity` |
| Group state machine `forming → opportunity_collection → selection_ready → selection → venture_created` | [`src/lib/domain/state-machine.ts`](../src/lib/domain/state-machine.ts) |
| Opportunity privacy until selection | `getWorkspace` + RLS in [`0003_rls.sql`](../migrations/0003_rls.sql) |
| Individual `opportunity_preferences` before the group decision | `opportunity_preferences`; studio select page |
| Selection rationale is a group artefact | `ventures.selection_rationale` |
| Challenging AI advisor (does not complete the work) | [`src/lib/server/advisor.ts`](../src/lib/server/advisor.ts) |
| Advisor sessions + structured challenge metadata | `ai_advisor_sessions`, `ai_advisor_messages` |
| Evidence classification (observation / interview / artefact / secondary) | `evidence_items.classification` |
| Assumptions with importance × confidence | `assumptions` |
| `assumption_evidence` join table (`supports` / `challenges`) | `assumption_evidence` |
| Append-only `activity_events` | `activity_events` |
| Auth vs later lecturer role (hook, not dashboard) | `app_roles`, `user_roles`, RLS comments |
| Offline-first writes, photo compression, conflict table | [`src/lib/offline/`](../src/lib/offline/), `sync_conflicts` |
| Opportunity revision snapshots | `opportunity_revisions` |
| Pedagogical “why” microcopy on forms | [`src/lib/domain/copy.ts`](../src/lib/domain/copy.ts) |

## Built beyond Slice 1

| Concept area | Where it lives |
|---|---|
| Customer discovery (interviews as evidence) | `interviews`; `src/routes/studio/listen.tsx` |
| Business model canvas linked to evidence | `canvas_entries`, `canvas_entry_evidence`; `studio/canvas.tsx` |
| Feasibility (market, technical, organisational, financial) | `feasibility_assessments`; `studio/feasibility.tsx` |
| Financial modelling (deterministic, no AI) | `financial_models`; `src/lib/domain/finance.ts` |
| Prototype submission and user testing | `prototypes`, `prototype_tests`; `studio/prototype.tsx` |
| Persevere / pivot / stop, ratified by majority | `venture_decisions`, `decision_votes` |
| Business-plan assembly from the record, pitch mode | `plan_sections`; `studio/pitch.tsx` |
| Simulation events (market shocks) | `market_events`, `event_responses`; `src/lib/domain/market-events.ts` |
| Lecturer dashboard, intervention, feedback | `staff`, `feedback`, `milestones`, `announcements`; `src/routes/lecturer/` |
| Contribution evidence and peer assessment | `activity_events`, `peer_ratings`, gradebook export |
| Individual reflection (private) | `reflections` |
| Group governance: leave, inactive members, majority decisions | `0006_group_governance.sql`, `governance.ts` |

## Still not built

Automated grading, financing simulation beyond the stress tests, venture marketplace, SSO / roster verification, object storage for photos.

## Stack (documented deviation)

The concept named Next.js, Supabase, and Claude. This workspace runs TanStack Start, Postgres (Neon / PGLite), Better Auth, and Claude `claude-opus-5`. Pedagogy and schema follow the concept; runtime follows the host. See [DEVIATIONS.md](./DEVIATIONS.md).
