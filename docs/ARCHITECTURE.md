# Architecture

## Folder structure

```
migrations/
  0001_auth.sql          Better Auth (copied, not edited)
  0002_schema.sql        academic + venture tables
  0003_rls.sql           executable RLS + future lecturer hook
  0004_seed.sql          course catalogue only
  0005_runtime_role.sql  restricted app_runtime role that makes RLS load-bearing
  0006_decisions_experiments_lecturers.sql
                         proposals/endorsements, experiments, assumption history,
                         lecturer notes + read policies, private advisor sessions
src/lib/domain/          types, state machine (pure rules), story.ts (next step), microcopy
src/lib/server/          createServerFn handlers, scoped by session
src/lib/offline/         IndexedDB + outbox + photo compress (full photo + 240px thumb)
src/components/ui/       design-system primitives (Button, Card, Sheet, ChoiceGrid, Tabs…)
src/routes/studio/       home, group, opportunity, select, venture, advisor
src/routes/teach/        cohort dashboard, group detail
```

## Data model notes

- `courses` + `course_offerings` are the identity of a run. `course_code` is not a primary key for groups or students.
- A student may later enrol in more than one offering (`course_enrolments`).
- Groups have `join_code`, `capacity`, `status`, and `created_by_student_id` (administrative owner, not academic leader).
- `opportunity_preferences` records individual judgement before the group decision.
- `assumption_evidence` is a join table with `relationship_type` (`supports` | `challenges`).
- `ai_advisor_sessions` group messages; messages carry JSON metadata.
- `activity_events` is append-only. No scoring in this slice.
- `user_roles` + `app_roles` exist so a later lecturer role does not rewrite tables.

IDs are UUID strings generated in application code so the schema does not require `pgcrypto`.

## Group state machine

`forming` → `opportunity_collection` → `selection_ready` → `selection` → `venture_created`

Selection opens when every **currently active** member has submitted (or, if `course_offerings.selection_requires_all_active` is false, at least half the group and at least two). A lecturer can open it early for a group once two ideas are in; then only the members who submitted vote. After selection opens nobody can join and submitted ideas are locked.

## Group decision

1. Every eligible voter records one private preference with a reason (≥15 chars). Preferences stay hidden — even counts per idea — until all have voted.
2. Any voter proposes a venture with a rationale (≥60 chars). The proposer endorses automatically.
3. Others endorse or object (objection needs a reason). `settle()` locks the group row and applies `course_offerings.decision_rule` (`majority` = more than half of eligible voters, or `all`). Accepted → the venture is created, the chosen idea is `selected` and the rest `rejected` (kept). Rejected → someone proposes again.

## Tests (experiments)

`experiments` hold a test card (hypothesis, method, success criteria set in advance, sample). Completing one requires a learning and, unless inconclusive, evidence; it links that evidence to the assumption and moves the assumption to supported/challenged. Every status/confidence change is written to `assumption_revisions` with its reason.

## Lecturers

`user_roles` rows with the lecturer role are scoped to a course offering and granted only by `claimLecturerRole` (invite code). SECURITY DEFINER helpers (`app_teaches_offering/group/venture`) back permissive `lecturer_read` SELECT policies, so a lecturer reads their own course's groups and nothing else; they write only `lecturer_notes` and the "opened early" flag.

## Opportunity privacy

Peer opportunities are hidden until the group is in `selection_ready`, `selection`, or `venture_created`. Drafts never leak. Enforced in `getWorkspace` and expressed as RLS in `0003_rls.sql`.

## Authz

Every mutating/reading server function uses `authMiddleware` and scopes work through the session `userId` → `students.auth_user_id` → `group_members`. Client-supplied user ids are ignored.

RLS policies are real SQL and actually enforced: `authMiddleware` runs every handler inside `runInScope()` (`src/lib/db.ts`), a per-request transaction as the restricted, non-owner `app_runtime` role (`0005_runtime_role.sql`) with `app.current_auth_user_id` set — not the privileged migration/owner connection, which Postgres exempts from its own RLS by default. `withRlsBypass()` is the explicit, audited escape hatch for the handful of genuinely system-level operations (join-by-code before membership exists, group-wide submission counts, seeding the demo cohort — see `docs/DEVIATIONS.md` §4 for the full list and why). `src/lib/server/rls.test.ts` proves cross-group access is denied at the database level, independent of the application code.

## Offline

1. Supported writes (opportunity, evidence, assumption, evidence-link) save to IndexedDB outbox first if the network is down.
2. UI states: online, offline, saved locally, syncing, synced, sync error.
3. Photos are compressed on device, stored with the outbox item, retried on failure — never discarded.
4. Evidence and assumptions are append-only. Opportunity edits write a revision row rather than last-write-wins.
5. Unresolved dual edits are stored in `sync_conflicts` (schema ready; Slice 1 prefers append-only).
6. AI requires a network. The UI says so instead of sending a request that fails silently.

## AI advisor

- Called only from `sendAdvisorMessage` (server function).
- Model: `grok-4.5` via `XAI_API_KEY`.
- Context is assembled from the current stage, venture, alternatives, rationale, recent evidence/assumptions, and recent messages — not the whole database.
- Response is parsed as `{ message, challenge_type, requires_evidence, related_assumption_id, suggested_next_action }`.
- Deterministic operations (join, capacity, required fields) never call the model.
