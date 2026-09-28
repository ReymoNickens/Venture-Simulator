-- Teaching at 1:400. Lecturers cannot read every submission, so the platform
-- gives them milestones, announcements, market shocks, stage feedback, and a
-- queue of groups that need attention — and records what they did.

create or replace function app_is_enrolled(p_offering_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_enrolments e
    where e.course_offering_id = p_offering_id
      and e.student_id = app_current_student_id()
      and e.status = 'active'
  );
$$;

-- Teaching staff identity (separate from students, like students are
-- separate from login accounts). The lecturer ROLE lives in user_roles.
create table if not exists staff (
  id text primary key,
  auth_user_id text not null unique,
  full_name text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table groups add column if not exists assigned_staff_id text references staff(id);
create index if not exists groups_assigned_staff_idx on groups (assigned_staff_id);
create index if not exists activity_events_created_idx on activity_events (group_id, created_at);

create table if not exists milestones (
  id text primary key,
  course_offering_id text not null references course_offerings(id),
  stage text not null,
  due_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_offering_id, stage)
);

create table if not exists announcements (
  id text primary key,
  course_offering_id text not null references course_offerings(id),
  staff_id text not null references staff(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_offering_idx on announcements (course_offering_id);

-- Market shocks: realistic events a lecturer releases to the cohort (or to
-- one group). Every student responds individually: what does this change?
create table if not exists market_events (
  id text primary key,
  course_offering_id text not null references course_offerings(id),
  group_id text references groups(id),
  staff_id text not null references staff(id),
  event_key text not null,
  title text not null,
  body text not null,
  prompt text not null,
  respond_by timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_events_offering_idx on market_events (course_offering_id);

create table if not exists event_responses (
  id text primary key,
  event_id text not null references market_events(id),
  group_id text not null references groups(id),
  student_id text not null references students(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, student_id)
);
create index if not exists event_responses_event_idx on event_responses (event_id);

-- Stage feedback from staff to a group, with an optional rubric level.
create table if not exists feedback (
  id text primary key,
  group_id text not null references groups(id),
  staff_id text not null references staff(id),
  stage text not null,
  body text not null,
  -- 1 beginning · 2 developing · 3 proficient · 4 exemplary
  level int,
  created_at timestamptz not null default now()
);
create index if not exists feedback_group_idx on feedback (group_id);

alter table staff enable row level security;
alter table milestones enable row level security;
alter table announcements enable row level security;
alter table market_events enable row level security;
alter table event_responses enable row level security;
alter table feedback enable row level security;

drop policy if exists staff_read on staff;
create policy staff_read on staff for select using (
  app_bypass_rls() or app_has_privileged_role() or auth_user_id = app_current_auth_user_id()
  or exists (select 1 from groups g where g.assigned_staff_id = staff.id and app_is_active_group_member(g.id))
  or exists (select 1 from feedback f where f.staff_id = staff.id and app_is_active_group_member(f.group_id))
);
drop policy if exists staff_write on staff;
create policy staff_write on staff for all using (
  app_bypass_rls() or app_has_privileged_role()
) with check (app_bypass_rls() or app_has_privileged_role());

drop policy if exists milestones_read on milestones;
create policy milestones_read on milestones for select using (
  app_bypass_rls() or app_has_privileged_role() or app_is_enrolled(course_offering_id)
);
drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements for select using (
  app_bypass_rls() or app_has_privileged_role() or app_is_enrolled(course_offering_id)
);
drop policy if exists market_events_read on market_events;
create policy market_events_read on market_events for select using (
  app_bypass_rls() or app_has_privileged_role()
  or (group_id is null and app_is_enrolled(course_offering_id))
  or (group_id is not null and app_is_active_group_member(group_id))
);
do $$
declare t text;
begin
  foreach t in array array['milestones', 'announcements', 'market_events', 'feedback'] loop
    execute format('drop policy if exists %1$s_staff_write on %1$s', t);
    execute format(
      'create policy %1$s_staff_write on %1$s for insert with check (app_bypass_rls() or app_has_privileged_role())', t);
    execute format('drop policy if exists %1$s_staff_update on %1$s', t);
    execute format(
      'create policy %1$s_staff_update on %1$s for update using (app_bypass_rls() or app_has_privileged_role())', t);
    execute format('drop policy if exists %1$s_staff_delete on %1$s', t);
    execute format(
      'create policy %1$s_staff_delete on %1$s for delete using (app_bypass_rls() or app_has_privileged_role())', t);
  end loop;
end
$$;

drop policy if exists event_responses_member on event_responses;
create policy event_responses_member on event_responses for select using (
  app_bypass_rls() or app_has_privileged_role() or app_is_active_group_member(group_id)
);
drop policy if exists event_responses_write on event_responses;
create policy event_responses_write on event_responses for all using (
  app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (student_id = app_current_student_id() and app_is_active_group_member(group_id))
);

drop policy if exists feedback_member on feedback;
create policy feedback_member on feedback for select using (
  app_bypass_rls() or app_has_privileged_role() or app_is_active_group_member(group_id)
);

grant select, insert, update, delete on
  staff, milestones, announcements, market_events, event_responses, feedback
to app_runtime;
