-- Row Level Security for Slice 1.
-- Application server functions also enforce the same rules (this stack's SQL
-- client is a privileged role and bypasses RLS). Policies are real, executable
-- Postgres so a later restricted-role or Supabase deploy does not rewrite tables.
--
-- Future lecturer/admin access is expressed via user_roles — policies never
-- hard-code "only students exist".

create or replace function app_current_auth_user_id() returns text
language sql stable as $$
  select nullif(current_setting('app.current_auth_user_id', true), '');
$$;

create or replace function app_bypass_rls() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.bypass_rls', true), '') = 'on';
$$;

create or replace function app_has_privileged_role() returns boolean
language sql stable as $$
  select exists (
    select 1
    from user_roles ur
    join app_roles r on r.id = ur.role_id
    where ur.user_id = app_current_auth_user_id()
      and r.name in ('lecturer', 'admin')
  );
$$;

create or replace function app_current_student_id() returns text
language sql stable as $$
  select s.id from students s
  where s.auth_user_id = app_current_auth_user_id()
  limit 1;
$$;

create or replace function app_is_active_group_member(p_group_id text) returns boolean
language sql stable as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = p_group_id
      and gm.student_id = app_current_student_id()
      and gm.membership_status = 'active'
  );
$$;

alter table students enable row level security;
alter table course_enrolments enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table opportunities enable row level security;
alter table opportunity_revisions enable row level security;
alter table opportunity_preferences enable row level security;
alter table ventures enable row level security;
alter table evidence_items enable row level security;
alter table assumptions enable row level security;
alter table assumption_evidence enable row level security;
alter table ai_advisor_sessions enable row level security;
alter table ai_advisor_messages enable row level security;
alter table activity_events enable row level security;
alter table sync_conflicts enable row level security;

drop policy if exists students_select on students;
create policy students_select on students for select using (
  app_bypass_rls() or app_has_privileged_role()
  or auth_user_id = app_current_auth_user_id()
  or exists (
    select 1 from group_members gm
    where gm.student_id = students.id
      and app_is_active_group_member(gm.group_id)
  )
);

drop policy if exists students_write on students;
create policy students_write on students for all using (
  app_bypass_rls() or app_has_privileged_role()
  or auth_user_id = app_current_auth_user_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or auth_user_id = app_current_auth_user_id()
);

drop policy if exists enrolments_member on course_enrolments;
create policy enrolments_member on course_enrolments for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists groups_member on groups;
create policy groups_member on groups for select using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(id)
);

drop policy if exists groups_write on groups;
create policy groups_write on groups for insert with check (
  app_bypass_rls() or app_has_privileged_role() or app_current_student_id() is not null
);
drop policy if exists groups_update on groups;
create policy groups_update on groups for update using (
  app_bypass_rls() or app_has_privileged_role() or app_is_active_group_member(id)
);

drop policy if exists group_members_select on group_members;
create policy group_members_select on group_members for select using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
  or student_id = app_current_student_id()
);

drop policy if exists group_members_write on group_members;
create policy group_members_write on group_members for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

-- Opportunity privacy: own rows always; peers only after selection opens; drafts never leak.
drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
  or (
    app_is_active_group_member(group_id)
    and status <> 'draft'
    and exists (
      select 1 from groups g
      where g.id = opportunities.group_id
        and g.status in ('selection_ready', 'selection', 'venture_created')
    )
  )
);

drop policy if exists opportunities_write on opportunities;
create policy opportunities_write on opportunities for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists opportunity_revisions_select on opportunity_revisions;
create policy opportunity_revisions_select on opportunity_revisions for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from opportunities o
    where o.id = opportunity_revisions.opportunity_id
      and o.student_id = app_current_student_id()
  )
);

drop policy if exists opportunity_preferences_member on opportunity_preferences;
create policy opportunity_preferences_member on opportunity_preferences for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
  or exists (
    select 1 from opportunities o
    where o.id = opportunity_preferences.opportunity_id
      and app_is_active_group_member(o.group_id)
      and exists (
        select 1 from groups g
        where g.id = o.group_id
          and g.status in ('selection_ready', 'selection', 'venture_created')
      )
  )
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists ventures_member on ventures;
create policy ventures_member on ventures for all using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
);

drop policy if exists evidence_member on evidence_items;
create policy evidence_member on evidence_items for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from ventures v
    where v.id = evidence_items.venture_id
      and app_is_active_group_member(v.group_id)
  )
);
drop policy if exists evidence_write on evidence_items;
create policy evidence_write on evidence_items for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists assumptions_member on assumptions;
create policy assumptions_member on assumptions for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from ventures v
    where v.id = assumptions.venture_id
      and app_is_active_group_member(v.group_id)
  )
);
drop policy if exists assumptions_write on assumptions;
create policy assumptions_write on assumptions for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists assumption_evidence_member on assumption_evidence;
create policy assumption_evidence_member on assumption_evidence for all using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from assumptions a
    join ventures v on v.id = a.venture_id
    where a.id = assumption_evidence.assumption_id
      and app_is_active_group_member(v.group_id)
  )
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from assumptions a
    join ventures v on v.id = a.venture_id
    where a.id = assumption_evidence.assumption_id
      and app_is_active_group_member(v.group_id)
  )
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

drop policy if exists activity_member on activity_events;
create policy activity_member on activity_events for select using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
  or (group_id is not null and app_is_active_group_member(group_id))
);
drop policy if exists activity_insert on activity_events;
create policy activity_insert on activity_events for insert with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

drop policy if exists sync_conflicts_own on sync_conflicts;
create policy sync_conflicts_own on sync_conflicts for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
);

-- Course catalogue is readable to authenticated students (join by offering, not by guessing group data).
alter table courses enable row level security;
alter table course_offerings enable row level security;
drop policy if exists courses_read on courses;
create policy courses_read on courses for select using (true);
drop policy if exists offerings_read on course_offerings;
create policy offerings_read on course_offerings for select using (true);
