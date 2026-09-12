# Deviations from the concept spec

Material differences, with reason.

## 1. Runtime stack

**Spec:** Next.js App Router, Supabase (Postgres + Auth + Storage), Claude API, Vercel.

**This build:** TanStack Start, Postgres via the host (Neon in production, PGLite in preview), Better Auth, xAI `grok-4.5`, same Vercel target.

**Why:** The app must run in this App Builder workspace. The pedagogical data model, privacy rules, state machine, offline queue, and advisor behaviour follow the concept, not the thinner VentureForge prompt.

## 2. Product name

**Spec:** Do not use VentureForge. Use Experiential Venture Platform or an env override.

**This build:** `APP_NAME` / `VITE_APP_NAME`, default **Experiential Venture Platform**. No VentureForge branding.

## 3. Storage for evidence photos

**Spec:** Private Supabase Storage bucket.

**This build:** Compressed JPEG stored as a data URL on `evidence_items.photo_data` (and in the IndexedDB outbox while offline). Size limits live on `course_offerings.max_photo_bytes`.

**Why:** No Supabase Storage in this stack; Vercel has no durable local filesystem. A later storage adapter can move `photo_data` to an object store without changing the evidence table’s meaning.

## 4. RLS enforcement

**Spec:** Database RLS is the security boundary; a direct API/DB access attempt against another group's data must be denied by the database, not application code.

**This build (updated):** Every authenticated server function now runs its queries inside `runInScope()` (`src/lib/db.ts`), a per-request transaction as a dedicated, non-owner `app_runtime` role (`migrations/0005_runtime_role.sql`) with `app.current_auth_user_id` set — so `migrations/0003_rls.sql`'s policies are the real access boundary on both Neon and the PGLite fallback, not inert SQL a privileged connection skips past. `src/lib/server/rls.test.ts` proves the acceptance criterion directly: a student's connection cannot read, update, or insert against another group's rows, even by primary key, even with no application code in between.

A small, explicitly commented set of call sites (`joinGroup`'s lookup-by-code, `createGroup`/`bootstrapDemoCohort`'s next-group-number read, `refreshGroupStatus`'s membership-wide submission count, `createVenture`'s rejection of sibling opportunities, `bootstrapDemoCohort`'s synthetic-peer seeding, `getWorkspace`'s and the advisor's group-wide progress/context reads) opt into `withRlsBypass()` for that one query — these are genuinely system-level operations (an operation on behalf of "the group" or before membership exists), not one student's own-row access, and each site says why in a comment. Turning RLS on for real also surfaced two bugs the privileged connection had been masking: `opportunity_revisions` had RLS enabled with no INSERT policy (silently denied every legitimate revision insert), and `students_select`'s peer-visibility branch recursed into `group_members`' own RLS-protected policy, which recursed back into `students` — now cut by marking the three identity/membership helper functions (`app_current_student_id`, `app_has_privileged_role`, `app_is_active_group_member`) `SECURITY DEFINER`, the standard fix for that class of RLS-helper recursion.

**Why not just enable RLS with no other changes:** the existing policies assumed row-level filtering would never actually run (RLS was written to be *correct on paper*, not exercised) — several legitimate flows (joining a group by code before you're a member, computing a group-wide submission count) are inherently cross-row/cross-user operations that a strict "your own rows only" policy cannot satisfy. The audited bypass list above is that gap made explicit and reviewable, rather than solved by leaving the whole connection privileged.

## 5. UUID generation

**Spec:** Database UUIDs.

**This build:** UUID v4 strings from `crypto.randomUUID()` stored as `text`, so the schema does not `create extension`.

## 6. AI provider

**Spec:** Anthropic Claude, server-side.

**This build:** xAI `grok-4.5`, server-side, same challenge contract and structured JSON. Explicitly accepted — the choice of model is not material to this slice; the challenge behaviour, context assembly, and server-side-only boundary are what the spec actually cares about, and those are unchanged.

## 7. Demo peers

**Spec:** Seed/test mechanism without ten real accounts; do not assume typed index numbers are a university roster.

**This build:** `bootstrapDemoCohort` creates synthetic academic identities (`is_synthetic`) that cannot sign in. They exist so one real student can walk selection, evidence, and assumptions.

## 8. Revision history

Opportunity updates insert `opportunity_revisions` snapshots. Full claim→outcome provenance is still later-slice work.

## Intentionally out of slice

Feasibility, finance, prototypes, resource mobilisation, simulation, lecturer dashboard, contribution/competency scoring, business-plan generation, marketplace, SSO/roster verification.
