-- Slice 2: group decisions by endorsement, assumption experiments, the lecturer role,
-- and the fixes from the Slice 1 review.

-- ── Course configuration ────────────────────────────────────────────────────
alter table course_offerings add column if not exists decision_rule text not null default 'majority';
alter table course_offerings add column if not exists ai_messages_per_day int not null default 40;
-- A lecturer joins an offering with this code. NULL = lecturer sign-up closed for this offering.
alter table course_offerings add column if not exists lecturer_invite_code text;

-- A lecturer may open selection for a group whose missing members aren't coming.
alter table groups add column if not exists selection_opened_by text;
alter table groups add column if not exists selection_opened_at timestamptz;

-- Small thumbnails are what lists load; the full photo is fetched on demand (low data).
alter table evidence_items add column if not exists photo_thumb text;

-- ── Group decision: one member proposes, the group endorses ─────────────────
create table if not exists venture_proposals (
  id text primary key,
  group_id text not null references groups(id),
  opportunity_id text not null references opportunities(id),
  proposed_by_student_id text not null references students(id),
  name text not null,
  rationale text not null,
  status text not null default 'open', -- open | accepted | rejected | withdrawn
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venture_proposals_group_idx on venture_proposals (group_id);
create unique index if not exists venture_proposals_one_open on venture_proposals (group_id) where status = 'open';

create table if not exists proposal_responses (
  id text primary key,
  proposal_id text not null references venture_proposals(id),
  student_id text not null references students(id),
  stance text not null, -- endorse | object
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, student_id)
);

alter table ventures add column if not exists proposal_id text references venture_proposals(id);

-- ── Experiments: test an assumption, record what happened ───────────────────
create table if not exists experiments (
  id text primary key,
  venture_id text not null references ventures(id),
  assumption_id text not null references assumptions(id),
  student_id text not null references students(id),
  hypothesis text not null,
  method text not null,
  success_criteria text not null,
  sample_target int,
  status text not null default 'planned', -- planned | done
  result text, -- supports | challenges | inconclusive
  learning text,
  completed_by_student_id text references students(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experiments_venture_idx on experiments (venture_id);

create table if not exists experiment_evidence (
  id text primary key,
  experiment_id text not null references experiments(id),
  evidence_item_id text not null references evidence_items(id),
  created_at timestamptz not null default now(),
  unique (experiment_id, evidence_item_id)
);

-- Confidence/status changes are history, never a silent overwrite.
create table if not exists assumption_revisions (
  id text primary key,
  assumption_id text not null references assumptions(id),
  student_id text not null references students(id),
  confidence_from text not null,
  confidence_to text not null,
  status_from text not null,
  status_to text not null,
  experiment_id text references experiments(id),
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists assumption_revisions_assumption_idx on assumption_revisions (assumption_id);

-- ── Lecturer feedback on a group ────────────────────────────────────────────
create table if not exists lecturer_notes (
  id text primary key,
  group_id text not null references groups(id),
  author_user_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists lecturer_notes_group_idx on lecturer_notes (group_id);

grant select, insert, update, delete on venture_proposals, proposal_responses, experiments,
  experiment_evidence, assumption_revisions, lecturer_notes to app_runtime;

-- ── Lecturer scope ──────────────────────────────────────────────────────────
-- Before: any lecturer role anywhere could read every group in every course.
-- Now: `admin` is global; a lecturer reads only the offerings they teach.
create or replace function app_has_privileged_role() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur join app_roles r on r.id = ur.role_id
    where ur.user_id = app_current_auth_user_id() and r.name = 'admin'
  );
$$;

create or replace function app_teaches_offering(p_offering_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur join app_roles r on r.id = ur.role_id
    where ur.user_id = app_current_auth_user_id()
      and r.name = 'lecturer'
      and ur.course_offering_id = p_offering_id
  );
$$;

create or replace function app_teaches_group(p_group_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups g where g.id = p_group_id and app_teaches_offering(g.course_offering_id));
$$;

create or replace function app_teaches_venture(p_venture_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ventures v where v.id = p_venture_id and app_teaches_group(v.group_id));
$$;

-- Permissive policies combine with OR, so these add lecturer read access without
-- rewriting the student policies in 0003.
drop policy if exists lecturer_read on groups;
create policy lecturer_read on groups for select using (app_teaches_offering(course_offering_id));
drop policy if exists lecturer_override on groups;
create policy lecturer_override on groups for update using (app_teaches_offering(course_offering_id));
drop policy if exists lecturer_read on group_members;
create policy lecturer_read on group_members for select using (app_teaches_group(group_id));
drop policy if exists lecturer_read on students;
create policy lecturer_read on students for select using (
  exists (select 1 from group_members gm where gm.student_id = students.id and app_teaches_group(gm.group_id))
  or exists (select 1 from course_enrolments e where e.student_id = students.id and app_teaches_offering(e.course_offering_id))
);
drop policy if exists lecturer_read on course_enrolments;
create policy lecturer_read on course_enrolments for select using (app_teaches_offering(course_offering_id));
drop policy if exists lecturer_read on opportunities;
create policy lecturer_read on opportunities for select using (app_teaches_group(group_id));
drop policy if exists lecturer_read on opportunity_preferences;
create policy lecturer_read on opportunity_preferences for select using (
  exists (select 1 from opportunities o where o.id = opportunity_preferences.opportunity_id and app_teaches_group(o.group_id))
);
drop policy if exists lecturer_read on ventures;
create policy lecturer_read on ventures for select using (app_teaches_group(group_id));
drop policy if exists lecturer_read on evidence_items;
create policy lecturer_read on evidence_items for select using (app_teaches_venture(venture_id));
drop policy if exists lecturer_read on assumptions;
create policy lecturer_read on assumptions for select using (app_teaches_venture(venture_id));
drop policy if exists lecturer_read on assumption_evidence;
create policy lecturer_read on assumption_evidence for select using (
  exists (select 1 from assumptions a where a.id = assumption_evidence.assumption_id and app_teaches_venture(a.venture_id))
);
drop policy if exists lecturer_read on ai_advisor_sessions;
create policy lecturer_read on ai_advisor_sessions for select using (app_teaches_group(group_id));
drop policy if exists lecturer_read on ai_advisor_messages;
create policy lecturer_read on ai_advisor_messages for select using (app_teaches_group(group_id));
drop policy if exists lecturer_read on activity_events;
create policy lecturer_read on activity_events for select using (group_id is not null and app_teaches_group(group_id));

-- user_roles decides who is staff: readable by its owner, written only by the system.
alter table user_roles enable row level security;
drop policy if exists user_roles_own on user_roles;
create policy user_roles_own on user_roles for select using (
  app_bypass_rls() or app_has_privileged_role() or user_id = app_current_auth_user_id()
);
drop policy if exists user_roles_write on user_roles;
create policy user_roles_write on user_roles for all using (app_bypass_rls() or app_has_privileged_role())
  with check (
    app_bypass_rls() or app_has_privileged_role()
    -- a signed-in user may give themselves only the student role (onboarding)
    or (user_id = app_current_auth_user_id() and role_id = 'role_student')
  );

-- Joining a group is only ever done through the join-code flow (which runs its checks
-- with the bypass). A student can no longer insert themselves into an arbitrary group.
drop policy if exists group_members_write on group_members;
create policy group_members_write on group_members for update using (
  app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id()
);
drop policy if exists group_members_insert on group_members;
create policy group_members_insert on group_members for insert with check (app_bypass_rls() or app_has_privileged_role());

-- ── RLS for the new tables ─────────────────────────────────────────────────
alter table venture_proposals enable row level security;
alter table proposal_responses enable row level security;
alter table experiments enable row level security;
alter table experiment_evidence enable row level security;
alter table assumption_revisions enable row level security;
alter table lecturer_notes enable row level security;

drop policy if exists member_all on venture_proposals;
create policy member_all on venture_proposals for all
  using (app_bypass_rls() or app_has_privileged_role() or app_is_active_group_member(group_id) or app_teaches_group(group_id))
  with check (app_bypass_rls() or app_has_privileged_role() or app_is_active_group_member(group_id));

drop policy if exists member_all on proposal_responses;
create policy member_all on proposal_responses for all
  using (app_bypass_rls() or app_has_privileged_role() or exists (
    select 1 from venture_proposals p where p.id = proposal_responses.proposal_id
      and (app_is_active_group_member(p.group_id) or app_teaches_group(p.group_id))))
  with check (app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id());

drop policy if exists member_all on experiments;
create policy member_all on experiments for all
  using (app_bypass_rls() or app_has_privileged_role() or exists (
    select 1 from ventures v where v.id = experiments.venture_id and app_is_active_group_member(v.group_id))
    or app_teaches_venture(venture_id))
  with check (app_bypass_rls() or app_has_privileged_role() or exists (
    select 1 from ventures v where v.id = experiments.venture_id and app_is_active_group_member(v.group_id)));

drop policy if exists member_all on experiment_evidence;
create policy member_all on experiment_evidence for all
  using (app_bypass_rls() or app_has_privileged_role() or exists (
    select 1 from experiments x join ventures v on v.id = x.venture_id
    where x.id = experiment_evidence.experiment_id and (app_is_active_group_member(v.group_id) or app_teaches_group(v.group_id))))
  with check (app_bypass_rls() or app_has_privileged_role() or exists (
    select 1 from experiments x join ventures v on v.id = x.venture_id
    where x.id = experiment_evidence.experiment_id and app_is_active_group_member(v.group_id)));

drop policy if exists member_all on assumption_revisions;
create policy member_all on assumption_revisions for all
  using (app_bypass_rls() or app_has_privileged_role() or exists (
    select 1 from assumptions a join ventures v on v.id = a.venture_id
    where a.id = assumption_revisions.assumption_id and (app_is_active_group_member(v.group_id) or app_teaches_group(v.group_id))))
  with check (app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id());

-- Assumptions: any member may update confidence/status (the change is recorded in
-- assumption_revisions), not only the student who wrote it.
drop policy if exists assumptions_member_update on assumptions;
create policy assumptions_member_update on assumptions for update using (
  exists (select 1 from ventures v where v.id = assumptions.venture_id and app_is_active_group_member(v.group_id))
);

drop policy if exists notes_read on lecturer_notes;
create policy notes_read on lecturer_notes for select using (
  app_bypass_rls() or app_has_privileged_role() or app_is_active_group_member(group_id) or app_teaches_group(group_id)
);
drop policy if exists notes_write on lecturer_notes;
create policy notes_write on lecturer_notes for insert with check (
  app_bypass_rls() or app_has_privileged_role()
  or (app_teaches_group(group_id) and author_user_id = app_current_auth_user_id())
);

-- ── Private advisor conversations ───────────────────────────────────────────
-- Talking to the advisor about your own idea (stage 'idea') happens before ideas are
-- shared, so those sessions belong to one student, not the group.
alter table ai_advisor_sessions add column if not exists student_id text references students(id);

create or replace function app_can_read_session(p_session_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ai_advisor_sessions s
    where s.id = p_session_id
      and (
        (app_is_active_group_member(s.group_id) and (s.student_id is null or s.student_id = app_current_student_id()))
        or app_teaches_group(s.group_id)
      )
  );
$$;

drop policy if exists ai_sessions_member on ai_advisor_sessions;
create policy ai_sessions_member on ai_advisor_sessions for all using (
  app_bypass_rls() or app_has_privileged_role()
  or (app_is_active_group_member(group_id) and (student_id is null or student_id = app_current_student_id()))
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (app_is_active_group_member(group_id) and (student_id is null or student_id = app_current_student_id()))
);

drop policy if exists ai_messages_member on ai_advisor_messages;
create policy ai_messages_member on ai_advisor_messages for all using (
  app_bypass_rls() or app_has_privileged_role() or app_can_read_session(session_id)
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (app_can_read_session(session_id) and student_id = app_current_student_id())
);
