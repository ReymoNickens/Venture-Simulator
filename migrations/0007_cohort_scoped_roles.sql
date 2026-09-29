-- Phase 2, Slice 0: scope lecturer access to their own cohorts, and stop
-- anyone granting themselves a role.
--
-- Before this migration app_has_privileged_role() was true for ANY lecturer
-- and every policy granted it full read AND write on every group in every
-- cohort. user_roles also had no RLS at all, so any request running as
-- app_runtime could insert a lecturer/admin row for itself. Neither was
-- reachable through current app code (no lecturer features exist yet), but
-- both would have become live the moment a lecturer view shipped.
--
-- After:
--   * app_has_privileged_role() means ADMIN only (global, as before).
--   * Lecturers get READ-ONLY access, and only to groups in course offerings
--     they hold a role_lecturer row for. Lecturer writes (pause, reopen,
--     inject event, ...) will go through explicit, audited server functions.
--   * user_roles is RLS-protected: a student can only ever add role_student
--     for themselves.

create or replace function app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = app_current_auth_user_id()
      and ur.role_id = 'role_admin'
  );
$$;

-- Redefined (not altered) so the lecturer branch disappears. CREATE OR REPLACE
-- resets function attributes, so SECURITY DEFINER is restated here.
create or replace function app_has_privileged_role() returns boolean
language sql stable security definer set search_path = public as $$
  select app_is_admin();
$$;

create or replace function app_is_lecturer_for_offering(p_offering_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = app_current_auth_user_id()
      and ur.role_id = 'role_lecturer'
      and ur.course_offering_id = p_offering_id
  );
$$;

create or replace function app_is_lecturer_for_group(p_group_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from groups g
    join user_roles ur on ur.course_offering_id = g.course_offering_id
    where g.id = p_group_id
      and ur.user_id = app_current_auth_user_id()
      and ur.role_id = 'role_lecturer'
  );
$$;

create or replace function app_is_lecturer_for_venture(p_venture_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ventures v
    where v.id = p_venture_id and app_is_lecturer_for_group(v.group_id)
  );
$$;

create or replace function app_is_lecturer_for_student(p_student_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_enrolments e
    where e.student_id = p_student_id
      and app_is_lecturer_for_offering(e.course_offering_id)
  );
$$;

-- Lecturer read-only policies. Permissive policies OR together with the
-- existing member/owner policies, so student access is unchanged.
drop policy if exists students_lecturer_read on students;
create policy students_lecturer_read on students for select
  using (app_is_lecturer_for_student(id));

drop policy if exists enrolments_lecturer_read on course_enrolments;
create policy enrolments_lecturer_read on course_enrolments for select
  using (app_is_lecturer_for_offering(course_offering_id));

drop policy if exists groups_lecturer_read on groups;
create policy groups_lecturer_read on groups for select
  using (app_is_lecturer_for_offering(course_offering_id));

drop policy if exists group_members_lecturer_read on group_members;
create policy group_members_lecturer_read on group_members for select
  using (app_is_lecturer_for_group(group_id));

-- Drafts stay private to their author, even from lecturers.
drop policy if exists opportunities_lecturer_read on opportunities;
create policy opportunities_lecturer_read on opportunities for select
  using (status <> 'draft' and app_is_lecturer_for_group(group_id));

drop policy if exists opportunity_preferences_lecturer_read on opportunity_preferences;
create policy opportunity_preferences_lecturer_read on opportunity_preferences for select
  using (exists (
    select 1 from opportunities o
    where o.id = opportunity_preferences.opportunity_id
      and app_is_lecturer_for_group(o.group_id)
  ));

drop policy if exists ventures_lecturer_read on ventures;
create policy ventures_lecturer_read on ventures for select
  using (app_is_lecturer_for_group(group_id));

drop policy if exists evidence_lecturer_read on evidence_items;
create policy evidence_lecturer_read on evidence_items for select
  using (app_is_lecturer_for_venture(venture_id));

drop policy if exists assumptions_lecturer_read on assumptions;
create policy assumptions_lecturer_read on assumptions for select
  using (app_is_lecturer_for_venture(venture_id));

drop policy if exists assumption_evidence_lecturer_read on assumption_evidence;
create policy assumption_evidence_lecturer_read on assumption_evidence for select
  using (exists (
    select 1 from assumptions a
    where a.id = assumption_evidence.assumption_id
      and app_is_lecturer_for_venture(a.venture_id)
  ));

drop policy if exists ai_sessions_lecturer_read on ai_advisor_sessions;
create policy ai_sessions_lecturer_read on ai_advisor_sessions for select
  using (app_is_lecturer_for_group(group_id));

drop policy if exists ai_messages_lecturer_read on ai_advisor_messages;
create policy ai_messages_lecturer_read on ai_advisor_messages for select
  using (app_is_lecturer_for_group(group_id));

drop policy if exists activity_lecturer_read on activity_events;
create policy activity_lecturer_read on activity_events for select
  using (group_id is not null and app_is_lecturer_for_group(group_id));

-- Roles: nobody promotes themselves.
alter table user_roles enable row level security;

drop policy if exists user_roles_select on user_roles;
create policy user_roles_select on user_roles for select using (
  app_bypass_rls() or app_is_admin()
  or user_id = app_current_auth_user_id()
);

drop policy if exists user_roles_insert on user_roles;
create policy user_roles_insert on user_roles for insert with check (
  app_bypass_rls() or app_is_admin()
  or (user_id = app_current_auth_user_id() and role_id = 'role_student')
);

drop policy if exists user_roles_admin_write on user_roles;
create policy user_roles_admin_write on user_roles for update
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());

drop policy if exists user_roles_admin_delete on user_roles;
create policy user_roles_admin_delete on user_roles for delete
  using (app_bypass_rls() or app_is_admin());

-- Reference tables: readable by everyone, writable only by the system.
alter table app_roles enable row level security;
drop policy if exists app_roles_read on app_roles;
create policy app_roles_read on app_roles for select using (true);
drop policy if exists app_roles_system_write on app_roles;
create policy app_roles_system_write on app_roles for all
  using (app_bypass_rls()) with check (app_bypass_rls());

alter table platform_settings enable row level security;
drop policy if exists platform_settings_read on platform_settings;
create policy platform_settings_read on platform_settings for select using (true);
drop policy if exists platform_settings_system_write on platform_settings;
create policy platform_settings_system_write on platform_settings for all
  using (app_bypass_rls()) with check (app_bypass_rls());
