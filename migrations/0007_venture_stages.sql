-- The rest of the venture journey: customer interviews, the business model
-- canvas, feasibility, the numbers, prototypes and their tests, the
-- persevere/pivot/stop decision, the plan narrative, individual reflections
-- and peer ratings.
--
-- Every table is append-friendly: records are added or retired, not silently
-- overwritten, so the claim → evidence → decision → outcome trail survives.

create or replace function app_is_venture_member(p_venture_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ventures v
    join group_members gm on gm.group_id = v.group_id
    where v.id = p_venture_id
      and gm.student_id = app_current_student_id()
      and gm.membership_status = 'active'
  );
$$;

-- ── Customer discovery ────────────────────────────────────────────────────
create table if not exists interviews (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  -- Each interview is also an evidence item, so it can support or challenge
  -- assumptions and back canvas entries like any other evidence.
  evidence_item_id text references evidence_items(id),
  interviewee_profile text not null,
  segment text not null default '',
  location text not null default '',
  conducted_on text,
  channel text not null default 'in_person',
  consent boolean not null default false,
  key_quotes text not null default '',
  pains text not null default '',
  current_solution text not null default '',
  spend_signal text not null default '',
  would_pay text not null default 'not_asked',
  pain_level int,
  surprise text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interviews_venture_idx on interviews (venture_id);

-- ── Business model canvas ─────────────────────────────────────────────────
create table if not exists canvas_entries (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  block text not null,
  body text not null,
  -- 'active' | 'retired' (replaced or disproven — kept for the record)
  status text not null default 'active',
  retired_reason text,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists canvas_entries_venture_idx on canvas_entries (venture_id);

create table if not exists canvas_entry_evidence (
  id text primary key,
  entry_id text not null references canvas_entries(id),
  evidence_item_id text not null references evidence_items(id),
  created_by_student_id text not null references students(id),
  created_at timestamptz not null default now(),
  unique (entry_id, evidence_item_id)
);

-- ── Feasibility (four lenses; latest row per lens is current) ─────────────
create table if not exists feasibility_assessments (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  lens text not null,
  verdict text not null,
  reasoning text not null,
  evidence_ids text not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists feasibility_venture_idx on feasibility_assessments (venture_id);

-- ── The numbers (versioned; latest is current) ───────────────────────────
create table if not exists financial_models (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  inputs text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists financial_models_venture_idx on financial_models (venture_id);

-- ── Prototypes and tests ──────────────────────────────────────────────────
create table if not exists prototypes (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  title text not null,
  kind text not null,
  description text not null default '',
  learning_goal text not null default '',
  cost_ghs numeric not null default 0,
  photo_data text,
  photo_mime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prototypes_venture_idx on prototypes (venture_id);

create table if not exists prototype_tests (
  id text primary key,
  prototype_id text not null references prototypes(id),
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  evidence_item_id text references evidence_items(id),
  tester_profile text not null,
  task text not null default '',
  observed text not null default '',
  quote text not null default '',
  outcome text not null default 'struggled',
  would_pay text not null default 'not_asked',
  created_at timestamptz not null default now()
);
create index if not exists prototype_tests_venture_idx on prototype_tests (venture_id);

-- ── Persevere / pivot / stop (proposed, then ratified like the venture) ──
create table if not exists venture_decisions (
  id text primary key,
  venture_id text not null references ventures(id),
  proposed_by_student_id text not null references students(id),
  decision text not null,
  rationale text not null,
  what_changes text not null default '',
  status text not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venture_decisions_venture_idx on venture_decisions (venture_id);
create unique index if not exists venture_decisions_one_open
  on venture_decisions (venture_id) where status = 'open';

create table if not exists decision_votes (
  id text primary key,
  decision_id text not null references venture_decisions(id),
  student_id text not null references students(id),
  vote text not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_id, student_id)
);

-- ── Plan narrative (latest row per section is current) ───────────────────
create table if not exists plan_sections (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  section text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists plan_sections_venture_idx on plan_sections (venture_id);

-- ── Individual reflection and peer rating ────────────────────────────────
create table if not exists reflections (
  id text primary key,
  student_id text not null references students(id),
  group_id text not null references groups(id),
  stage text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists reflections_student_idx on reflections (student_id);
create index if not exists reflections_group_idx on reflections (group_id);

create table if not exists peer_ratings (
  id text primary key,
  group_id text not null references groups(id),
  rater_student_id text not null references students(id),
  ratee_student_id text not null references students(id),
  score int not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, rater_student_id, ratee_student_id)
);
create index if not exists peer_ratings_group_idx on peer_ratings (group_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table interviews enable row level security;
alter table canvas_entries enable row level security;
alter table canvas_entry_evidence enable row level security;
alter table feasibility_assessments enable row level security;
alter table financial_models enable row level security;
alter table prototypes enable row level security;
alter table prototype_tests enable row level security;
alter table venture_decisions enable row level security;
alter table decision_votes enable row level security;
alter table plan_sections enable row level security;
alter table reflections enable row level security;
alter table peer_ratings enable row level security;

-- Venture-scoped records: the whole group reads; a student writes as themself.
do $$
declare t text;
begin
  foreach t in array array[
    'interviews', 'canvas_entries', 'feasibility_assessments', 'financial_models',
    'prototypes', 'prototype_tests', 'plan_sections'
  ] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format(
      'create policy %1$s_read on %1$s for select using (
         app_bypass_rls() or app_has_privileged_role() or app_is_venture_member(venture_id))', t);
    execute format('drop policy if exists %1$s_insert on %1$s', t);
    execute format(
      'create policy %1$s_insert on %1$s for insert with check (
         app_bypass_rls() or app_has_privileged_role()
         or (student_id = app_current_student_id() and app_is_venture_member(venture_id)))', t);
    execute format('drop policy if exists %1$s_update on %1$s', t);
    execute format(
      'create policy %1$s_update on %1$s for update using (
         app_bypass_rls() or app_has_privileged_role() or app_is_venture_member(venture_id))', t);
  end loop;
end
$$;

drop policy if exists canvas_entry_evidence_member on canvas_entry_evidence;
create policy canvas_entry_evidence_member on canvas_entry_evidence for all using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from canvas_entries c
    where c.id = canvas_entry_evidence.entry_id and app_is_venture_member(c.venture_id)
  )
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (
    created_by_student_id = app_current_student_id()
    and exists (
      select 1 from canvas_entries c
      where c.id = canvas_entry_evidence.entry_id and app_is_venture_member(c.venture_id)
    )
  )
);

drop policy if exists venture_decisions_read on venture_decisions;
create policy venture_decisions_read on venture_decisions for select using (
  app_bypass_rls() or app_has_privileged_role() or app_is_venture_member(venture_id)
);
drop policy if exists venture_decisions_insert on venture_decisions;
create policy venture_decisions_insert on venture_decisions for insert with check (
  app_bypass_rls() or app_has_privileged_role()
  or (proposed_by_student_id = app_current_student_id() and app_is_venture_member(venture_id))
);
drop policy if exists venture_decisions_update on venture_decisions;
create policy venture_decisions_update on venture_decisions for update using (
  app_bypass_rls() or app_has_privileged_role() or app_is_venture_member(venture_id)
);

drop policy if exists decision_votes_read on decision_votes;
create policy decision_votes_read on decision_votes for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from venture_decisions d
    where d.id = decision_votes.decision_id and app_is_venture_member(d.venture_id)
  )
);
drop policy if exists decision_votes_write on decision_votes;
create policy decision_votes_write on decision_votes for all using (
  app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (
    student_id = app_current_student_id()
    and exists (
      select 1 from venture_decisions d
      where d.id = decision_votes.decision_id and app_is_venture_member(d.venture_id)
    )
  )
);

-- Reflections are private to the student (and teaching staff): honest
-- reflection does not survive being read by the group.
drop policy if exists reflections_own on reflections;
create policy reflections_own on reflections for all using (
  app_bypass_rls() or app_has_privileged_role() or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (student_id = app_current_student_id() and app_is_active_group_member(group_id))
);

-- Peer ratings: only the rater (and staff) can see a rating.
drop policy if exists peer_ratings_own on peer_ratings;
create policy peer_ratings_own on peer_ratings for all using (
  app_bypass_rls() or app_has_privileged_role() or rater_student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (rater_student_id = app_current_student_id() and app_is_active_group_member(group_id))
);

grant select, insert, update, delete on
  interviews, canvas_entries, canvas_entry_evidence, feasibility_assessments,
  financial_models, prototypes, prototype_tests, venture_decisions, decision_votes,
  plan_sections, reflections, peer_ratings
to app_runtime;

-- Stage requirements are course configuration, not code.
alter table course_offerings add column if not exists interviews_per_member int not null default 2;
alter table course_offerings add column if not exists min_prototype_tests int not null default 5;
