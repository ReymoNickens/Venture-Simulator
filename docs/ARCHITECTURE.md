# Architecture — Slice 1

## Folder structure

```
migrations/
  0001_auth.sql          Better Auth (copied, not edited)
  0002_schema.sql        academic + venture tables
  0003_rls.sql           executable RLS + future lecturer hook
  0004_seed.sql          course catalogue only
  0005_runtime_role.sql  restricted app_runtime role that makes RLS load-bearing
src/lib/domain/          types, group state machine, microcopy
src/lib/server/          createServerFn handlers, scoped by session
src/lib/offline/         IndexedDB + outbox + photo compress
src/routes/studio/       group → opportunity → select → venture
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

Selection opens only when every **currently active** member has submitted. Missing students are not treated as submitted. `course_offerings.selection_requires_all_active` is the hook for a later override.

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
5. An opportunity can be edited only while ideas are private (`canEditOwnOpportunity`). Once the group can see every idea, each stays as sealed. An edit made offline that only reaches the server after that point is neither applied nor refused: both versions go into `sync_conflicts` for later resolution, and the queue moves on.
6. Failed sync items are never discarded. They retry with backoff (5s doubling, capped at 10 min — `src/lib/offline/retry.ts`), on reconnect, and on a 20s background timer while online. The "retry" button skips the backoff.
7. Forms that take longer than a minute (opportunity, evidence, assumption, interview) autosave a draft on the device per account, so a refresh or a closed tab does not lose typed work. If storage is full, an evidence draft keeps the words and drops the photo.
8. AI requires a network. The UI says so instead of sending a request that fails silently.

## AI advisor

- Called only from `sendAdvisorMessage` (server function).
- Model: `claude-opus-5` via `ANTHROPIC_API_KEY`.
- Context is assembled from the current stage, venture, alternatives, rationale, recent evidence/assumptions, and recent messages — not the whole database.
- Response is parsed as `{ message, challenge_type, requires_evidence, related_assumption_id, suggested_next_action }`.
- Deterministic operations (join, capacity, required fields) never call the model.
