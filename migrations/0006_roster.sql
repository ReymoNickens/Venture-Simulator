-- Pre-provisioned roster + sign-in by email or index number.
--
-- There is no open self-registration: an instructor pre-loads the roster
-- (scripts/roster-import.mjs) with each student's email + index number ahead
-- of time, as an UNCLAIMED students row (auth_user_id null). A student then
-- "activates" their own account by supplying a password that matches one of
-- these rows (see src/lib/auth/server.ts's databaseHooks.user.create), which
-- claims it (sets auth_user_id) and takes the name from the roster.

alter table students alter column auth_user_id drop not null;
alter table students add column if not exists email text;
create unique index if not exists students_email_idx on students (lower(email))
  where email is not null;

-- Better Auth's `username` plugin columns — a student's index number doubles
-- as their username, so sign-in accepts either identifier.
alter table "user" add column if not exists "username" text;
alter table "user" add column if not exists "displayUsername" text;
create unique index if not exists "user_username_idx" on "user" ("username")
  where "username" is not null;
