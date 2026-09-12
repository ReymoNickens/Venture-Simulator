-- Make RLS the real enforcement boundary, not just executable-but-inert SQL.
--
-- Every migration/seed/admin connection runs as the DB owner, and Postgres
-- exempts a table's owner from its own RLS policies by default — so up to now
-- every query, however it reached Postgres, saw every row. `app_runtime` is a
-- separate, non-owner, non-superuser role with no BYPASSRLS: the app now runs
-- its per-request queries as this role (see src/lib/db.ts `runInScope`), so
-- `0003_rls.sql`'s policies actually filter rows for the first time.
--
-- `app_bypass_rls()` (defined in 0003_rls.sql) remains the sanctioned escape
-- hatch for the handful of server-side operations that are legitimately
-- system-level rather than "one student reading their own rows" — looking up
-- a group by its join code before you are a member, computing the next
-- group number, rolling a group's status forward from membership-wide counts,
-- transitioning sibling opportunities to rejected when a venture is created,
-- and seeding the synthetic demo cohort. Each call site sets it explicitly
-- and narrowly via `withRlsBypass()`; see src/lib/server for the audited list.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime nologin noinherit;
  end if;
end
$$;

-- The connecting role (Neon's app user, or PGlite's default admin role) must
-- be a member of app_runtime to `set local role app_runtime` per request.
grant app_runtime to current_user;

grant usage on schema public to app_runtime;
grant select, insert, update, delete on all tables in schema public to app_runtime;
alter default privileges for role current_user in schema public
  grant select, insert, update, delete on tables to app_runtime;

-- Bug found only once RLS actually applies: this table had RLS enabled
-- (0003_rls.sql) but no INSERT policy, so every revision insert made by a
-- non-owner role would have been silently denied.
drop policy if exists opportunity_revisions_insert on opportunity_revisions;
create policy opportunity_revisions_insert on opportunity_revisions for insert with check (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from opportunities o
    where o.id = opportunity_revisions.opportunity_id
      and o.student_id = app_current_student_id()
  )
);

-- These three are identity/membership PRIMITIVES that policies call, not
-- "a student's own data" reads — students_select's own policy (0003_rls.sql)
-- calls app_is_active_group_member(), which calls app_current_student_id(),
-- which selects from students, which is RLS'd by students_select: without
-- SECURITY DEFINER, resolving "who is the current student" recurses back
-- through the very policy asking the question. Marking them SECURITY DEFINER
-- makes them resolve identity once, as their (trusted, already-owner) definer,
-- rather than re-entering RLS on every cross-table policy check — the
-- standard fix for this class of policy-helper recursion. Each only ever
-- returns a fact about the CALLER's own session (never arbitrary rows), so
-- this widens no one's access.
alter function app_current_student_id() security definer set search_path = public;
alter function app_has_privileged_role() security definer set search_path = public;
alter function app_is_active_group_member(text) security definer set search_path = public;
