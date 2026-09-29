# 0005: Lecturers are read-only and scoped to their own cohorts

**Context.** The audit found `app_has_privileged_role()` was true for any lecturer and granted read AND write on every group in every cohort, and that `user_roles` had no RLS, so a request running as `app_runtime` could insert a lecturer row for itself.

**Decision** (`migrations/0006_cohort_scoped_roles.sql`).
- `app_has_privileged_role()` now means admin only.
- Lecturers get SELECT-only policies, limited to groups in offerings they hold `role_lecturer` for. Drafts stay private even from lecturers.
- Lecturer *actions* (pause, advance, reopen, inject event, reset) will be explicit, audited server functions, not table write access.
- `user_roles` has RLS: a user can only add `role_student` for themselves; everything else is admin/system.

**Consequences.** Regression tests in `src/lib/server/rls-cohort.test.ts` (9 of 11 fail without the migration). Admin/lecturer rows must be created by an admin or a seed script, which Slice E adds.
