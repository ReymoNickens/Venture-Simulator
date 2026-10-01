-- Class lists kept by course reps, not by database scripts.
--
-- A "class" is one course offering for one programme and level, e.g.
-- ENT 302 · BSc Business Administration · Level 300 · 2026/2027 Semester 1.
-- The platform owner hands a course rep a one-time setup code (stored here
-- only as a hash). The rep redeems it to create their class, becomes its rep,
-- and uploads the class list from the Excel template. Students on that list
-- can then activate their own accounts as before (0006_roster.sql).
--
-- Safe to run twice: every statement is guarded.

alter table course_offerings add column if not exists programme text;
alter table course_offerings add column if not exists level text;
alter table course_offerings add column if not exists rep_student_id text references students(id);
create index if not exists course_offerings_rep_idx on course_offerings (rep_student_id);

create table if not exists rep_setup_codes (
  id text primary key,
  -- sha256 of the normalised code; the code itself is shown once and never stored.
  code_hash text not null unique,
  course_id text not null references courses(id),
  -- The owner's own note to tell codes apart, e.g. "BSc Business L300 — Kofi".
  label text not null,
  semester text not null,
  academic_year text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  course_offering_id text references course_offerings(id)
);

-- Only server code that has already checked the owner's access code or the
-- rep's setup code (and switched on the bypass for that step) may touch it.
alter table rep_setup_codes enable row level security;
drop policy if exists rep_setup_codes_system on rep_setup_codes;
create policy rep_setup_codes_system on rep_setup_codes for all
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());

-- Classes are created by the server when a rep redeems a code (bypass on for
-- that step). Signed-in students keep read-only access via offerings_read.
drop policy if exists offerings_system_write on course_offerings;
create policy offerings_system_write on course_offerings for insert
  with check (app_bypass_rls() or app_is_admin());
drop policy if exists offerings_system_update on course_offerings;
create policy offerings_system_update on course_offerings for update
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());
