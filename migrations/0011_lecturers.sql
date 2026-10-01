-- Lecturers: invited by the platform owner, scoped to the classes they teach.
--
-- The owner makes a one-time lecturer code (stored as a hash) naming the
-- classes. The lecturer redeems it with their name and email, which creates
-- an unclaimed `staff` row; signing up with that email claims it, and the
-- sign-up hook grants role_lecturer for each class in `staff_classes`.
-- Permission checks stay where they were (user_roles, 0007): staff_classes
-- is the owner's record of who teaches what, kept in step by the server.
--
-- Lecturers can leave feedback for a group (group_feedback), which the
-- group's members see. Feedback is append-only.
--
-- Safe to run twice: every statement is guarded.

create table if not exists staff (
  id text primary key,
  auth_user_id text unique,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_email_idx on staff (lower(email));

create table if not exists staff_classes (
  staff_id text not null references staff(id) on delete cascade,
  course_offering_id text not null references course_offerings(id),
  created_at timestamptz not null default now(),
  primary key (staff_id, course_offering_id)
);

create table if not exists lecturer_invites (
  id text primary key,
  code_hash text not null unique,
  label text not null,
  offering_ids text[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  staff_id text references staff(id)
);

create table if not exists group_feedback (
  id text primary key,
  group_id text not null references groups(id),
  author_user_id text not null,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists group_feedback_group_idx on group_feedback (group_id, created_at desc);

alter table staff enable row level security;
alter table staff_classes enable row level security;
alter table lecturer_invites enable row level security;
alter table group_feedback enable row level security;

-- A lecturer reads their own staff row and class list; the server (bypass,
-- after checking the owner's code or the invite code) does every write.
drop policy if exists staff_self_read on staff;
create policy staff_self_read on staff for select
  using (app_bypass_rls() or app_is_admin() or auth_user_id = app_current_auth_user_id());
drop policy if exists staff_system_write on staff;
create policy staff_system_write on staff for all
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());

drop policy if exists staff_classes_self_read on staff_classes;
create policy staff_classes_self_read on staff_classes for select using (
  app_bypass_rls() or app_is_admin()
  or exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = app_current_auth_user_id())
);
drop policy if exists staff_classes_system_write on staff_classes;
create policy staff_classes_system_write on staff_classes for all
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());

drop policy if exists lecturer_invites_system on lecturer_invites;
create policy lecturer_invites_system on lecturer_invites for all
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());

-- Feedback: the group's active members and its class's lecturers can read;
-- only a lecturer of that class can write, as themselves; nobody edits.
drop policy if exists group_feedback_read on group_feedback;
create policy group_feedback_read on group_feedback for select using (
  app_bypass_rls() or app_is_admin()
  or app_is_active_group_member(group_id)
  or app_is_lecturer_for_group(group_id)
);
drop policy if exists group_feedback_write on group_feedback;
create policy group_feedback_write on group_feedback for insert with check (
  app_bypass_rls()
  or (app_is_lecturer_for_group(group_id) and author_user_id = app_current_auth_user_id())
);
