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

## Added in the studio/lecturer update

| Rule | Where it lives |
|---|---|
| The group decision is a proposal the group endorses (majority or all), not one student's click | `venture_proposals`, `proposal_responses` ([`0006`](../migrations/0006_decisions_experiments_lecturers.sql)); [`decisions.ts`](../src/lib/server/decisions.ts) |
| Votes are sealed until every eligible voter has voted | `preferencesRevealed` in the state machine; `getWorkspace` |
| An idea can't change once peers can read it; nobody joins after comparison opens | `canEditOpportunity`, `canJoinGroup` |
| Assumptions are tested with test cards; results change confidence with a kept reason | `experiments`, `experiment_evidence`, `assumption_revisions`; [`experiments.ts`](../src/lib/server/experiments.ts) |
| Lecturer role scoped to a course offering; read-only on student work | `app_teaches_*` functions + `lecturer_read` policies; [`lecturer.ts`](../src/lib/server/lecturer.ts); `/teach` |
| Contribution visible per student (from the activity log and records) | `getGroupDetail` → contribution table |
| Private advisor chats while writing an idea; daily AI allowance | `ai_advisor_sessions.student_id`, `app_can_read_session`; `course_offerings.ai_messages_per_day` |

## Intentionally not built (later chapters)

Business model, prototypes, finance, resource mobilisation, simulation, competency scoring/grading, business-plan generation, marketplace, SSO / roster verification. Students see the first four as "later in the course".

## Stack (documented deviation)

The concept named Next.js, Supabase, and Claude. This workspace runs TanStack Start, Postgres (Neon / PGLite), Better Auth, and xAI `grok-4.5`. Pedagogy and schema follow the concept; runtime follows the host. See [DEVIATIONS.md](./DEVIATIONS.md).
