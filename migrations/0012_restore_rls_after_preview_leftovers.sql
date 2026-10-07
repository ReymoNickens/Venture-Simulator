-- Put back this app's own access rules where an unmerged branch replaced them.
--
-- Preview builds share the production database, and the unmerged branch
-- `claude/studio-ux-lecturer` ran its migration
-- 0006_decisions_experiments_lecturers.sql there. It rewrote rules on tables
-- this app uses:
--   - group_members: inserts limited to the system, so a student could no
--     longer start a group, join one or open a practice group ("new row
--     violates row-level security policy for table group_members");
--   - extra lecturer_read policies, including on opportunities with no
--     draft filter (0007 keeps drafts private, even from lecturers), and a
--     lecturer_override letting lecturers update groups;
--   - assumptions editable by any group member, and its own user_roles,
--     AI-session and AI-message rules;
--   - app_has_privileged_role() redefined.
--
-- This restores the definitions from 0003 and 0007 and drops the branch's
-- extra policies on our tables. Its own tables (venture_proposals,
-- experiments, lecturer_notes, ...) are left alone: nothing here reads them.
-- On a database that never had the branch, every statement is a no-op
-- restatement. Safe to run twice.

create or replace function app_has_privileged_role() returns boolean
language sql stable security definer set search_path = public as $$
  select app_is_admin();
$$;

drop policy if exists group_members_insert on group_members;
drop policy if exists group_members_write on group_members;
create policy group_members_write on group_members for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists ai_sessions_member on ai_advisor_sessions;
create policy ai_sessions_member on ai_advisor_sessions for all using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
);

drop policy if exists ai_messages_member on ai_advisor_messages;
create policy ai_messages_member on ai_advisor_messages for all using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
);

drop policy if exists lecturer_override on groups;
drop policy if exists assumptions_member_update on assumptions;
drop policy if exists user_roles_own on user_roles;
drop policy if exists user_roles_write on user_roles;

do $$
declare t text;
begin
  foreach t in array array[
    'groups', 'group_members', 'students', 'course_enrolments', 'opportunities',
    'opportunity_preferences', 'ventures', 'evidence_items', 'assumptions',
    'assumption_evidence', 'ai_advisor_sessions', 'ai_advisor_messages', 'activity_events'
  ] loop
    execute format('drop policy if exists lecturer_read on %I', t);
  end loop;
end $$;
