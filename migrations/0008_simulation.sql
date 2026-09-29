-- Phase 2, Slice B: storage for the simulation engine (src/sim).
--
-- Who can write what (docs/decisions/0012):
--   * Students (app_runtime) may INSERT their group's decisions for the next
--     period, and nothing else. Decisions can never be updated or deleted by
--     them: submission locks the period.
--   * Results, the cash ledger, simulation state and cohort events are
--     written ONLY by app_sim_engine, a separate role the server switches to
--     for the period runner. app_runtime has no INSERT/UPDATE/DELETE on those
--     tables at all, so a mistake in any student-facing server function
--     cannot write an outcome: the database refuses.
--   * Full engine output and state (which will include lecturer-only lines,
--     ADR 0008) are not readable by app_runtime at all (column privileges);
--     students read `student_output`, already filtered by studentView().

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_sim_engine') then
    create role app_sim_engine nologin noinherit;
  end if;
end
$$;
grant app_sim_engine to current_user;
grant usage on schema public to app_sim_engine;

create or replace function app_is_sim_engine() returns boolean
language sql stable as $$
  select current_user = 'app_sim_engine';
$$;

create or replace function app_is_enrolled_in_offering(p_offering_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_enrolments e
    where e.course_offering_id = p_offering_id
      and e.student_id = app_current_student_id()
      and e.status = 'active'
  );
$$;

-- One simulation configuration per cohort (course offering). The scenario is
-- frozen here as JSON when the cohort starts, so later code changes to the
-- default scenario never alter a running cohort.
create table if not exists simulation_cohorts (
  id text primary key,
  course_offering_id text not null unique references course_offerings(id),
  scenario_id text not null,
  scenario_version int not null,
  scenario jsonb not null,
  engine_version text not null,
  period_count int not null check (period_count between 4 and 8),
  -- Groups may run periods up to this one (lecturer pacing, Slice E).
  open_through_period int not null,
  status text not null default 'running' check (status in ('running', 'paused', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (open_through_period between 0 and period_count)
);

-- A row per cohort period whose events have been drawn (ADR 0004).
create table if not exists simulation_cohort_periods (
  cohort_id text not null references simulation_cohorts(id),
  period int not null check (period >= 1),
  drawn_at timestamptz not null default now(),
  primary key (cohort_id, period)
);

create table if not exists simulation_cohort_events (
  id text primary key,
  cohort_id text not null references simulation_cohorts(id),
  period int not null check (period >= 1),
  instance_id text not null,
  event_id text not null,
  origin text not null check (origin in ('drawn', 'injected')),
  created_at timestamptz not null default now(),
  unique (cohort_id, instance_id)
);
create index if not exists simulation_cohort_events_period_idx
  on simulation_cohort_events (cohort_id, period);

create table if not exists simulations (
  id text primary key,
  cohort_id text not null references simulation_cohorts(id),
  group_id text not null unique references groups(id),
  venture_id text not null unique references ventures(id),
  engine_version text not null,
  scenario_id text not null,
  scenario_version int not null,
  status text not null default 'operating' check (status in ('operating', 'cash_out', 'exited')),
  completed_period int not null default 0 check (completed_period >= 0),
  started_by_student_id text not null references students(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists simulations_cohort_idx on simulations (cohort_id);

create table if not exists simulation_decisions (
  id text primary key,
  simulation_id text not null references simulations(id),
  period int not null check (period >= 1),
  decisions jsonb not null,
  submitted_by_student_id text not null references students(id),
  -- Offline replay: the same client submission is recognised, not duplicated.
  client_id text,
  submitted_at timestamptz not null default now(),
  -- One locked decision set per period: a second submission is refused.
  unique (simulation_id, period)
);

create table if not exists simulation_results (
  id text primary key,
  simulation_id text not null references simulations(id),
  period int not null check (period >= 1),
  engine_version text not null,
  seed text not null,
  cohort_events jsonb not null,
  -- Full engine output (without newState): lecturer/audit only.
  output jsonb not null,
  -- The same output filtered by studentView(): what students may read.
  student_output jsonb not null,
  -- The engine's newState after this period: input to the next run.
  state jsonb not null,
  closing_cash bigint not null,
  status text not null,
  created_at timestamptz not null default now(),
  -- A period is computed exactly once.
  unique (simulation_id, period)
);

-- The cash ledger, one row per engine transaction. Append-only. Cash is the
-- sum of amounts; there is no balance column anywhere.
create table if not exists simulation_transactions (
  simulation_id text not null references simulations(id),
  tx_id text not null,
  period int not null check (period >= 0),
  category text not null,
  amount bigint not null,
  memo text not null,
  ref text,
  explain_id text not null,
  created_at timestamptz not null default now(),
  primary key (simulation_id, tx_id)
);

-- Privileges. 0005 gave app_runtime full DML on every new table by default;
-- take it back and grant only what each role needs.
revoke all on simulation_cohorts, simulation_cohort_periods, simulation_cohort_events,
  simulations, simulation_decisions, simulation_results, simulation_transactions
  from app_runtime;
grant select on simulation_cohorts, simulation_cohort_periods, simulation_cohort_events,
  simulations, simulation_decisions, simulation_transactions to app_runtime;
grant insert on simulation_decisions to app_runtime;
grant select (id, simulation_id, period, engine_version, student_output, closing_cash, status, created_at)
  on simulation_results to app_runtime;

grant select, insert, update on simulation_cohorts, simulation_cohort_periods,
  simulation_cohort_events, simulations, simulation_results, simulation_transactions
  to app_sim_engine;
grant select on simulation_decisions to app_sim_engine;

-- RLS.
alter table simulation_cohorts enable row level security;
alter table simulation_cohort_periods enable row level security;
alter table simulation_cohort_events enable row level security;
alter table simulations enable row level security;
alter table simulation_decisions enable row level security;
alter table simulation_results enable row level security;
alter table simulation_transactions enable row level security;

-- The engine role may do what its grants allow, on any row.
do $$
declare t text;
begin
  foreach t in array array['simulation_cohorts', 'simulation_cohort_periods', 'simulation_cohort_events',
    'simulations', 'simulation_decisions', 'simulation_results', 'simulation_transactions']
  loop
    execute format('drop policy if exists %1$s_engine on %1$s', t);
    execute format(
      'create policy %1$s_engine on %1$s for all using (app_is_sim_engine()) with check (app_is_sim_engine())', t);
  end loop;
end
$$;

-- Cohort settings: visible to its students and its lecturers.
drop policy if exists simulation_cohorts_read on simulation_cohorts;
create policy simulation_cohorts_read on simulation_cohorts for select using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_enrolled_in_offering(course_offering_id)
  or app_is_lecturer_for_offering(course_offering_id)
);

-- Cohort events: lecturers only. Students learn about events through their
-- own results, never ahead of time from a faster group's draw.
drop policy if exists simulation_cohort_events_lecturer on simulation_cohort_events;
create policy simulation_cohort_events_lecturer on simulation_cohort_events for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from simulation_cohorts c
    where c.id = simulation_cohort_events.cohort_id
      and app_is_lecturer_for_offering(c.course_offering_id)
  )
);
drop policy if exists simulation_cohort_periods_lecturer on simulation_cohort_periods;
create policy simulation_cohort_periods_lecturer on simulation_cohort_periods for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from simulation_cohorts c
    where c.id = simulation_cohort_periods.cohort_id
      and app_is_lecturer_for_offering(c.course_offering_id)
  )
);

-- A group's simulation: its active members and its cohort's lecturers.
create or replace function app_can_read_simulation(p_simulation_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from simulations s
    where s.id = p_simulation_id
      and (app_is_active_group_member(s.group_id) or app_is_lecturer_for_group(s.group_id))
  );
$$;

drop policy if exists simulations_read on simulations;
create policy simulations_read on simulations for select using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
  or app_is_lecturer_for_group(group_id)
);

drop policy if exists simulation_results_read on simulation_results;
create policy simulation_results_read on simulation_results for select using (
  app_bypass_rls() or app_has_privileged_role() or app_can_read_simulation(simulation_id)
);

drop policy if exists simulation_transactions_read on simulation_transactions;
create policy simulation_transactions_read on simulation_transactions for select using (
  app_bypass_rls() or app_has_privileged_role() or app_can_read_simulation(simulation_id)
);

drop policy if exists simulation_decisions_read on simulation_decisions;
create policy simulation_decisions_read on simulation_decisions for select using (
  app_bypass_rls() or app_has_privileged_role() or app_can_read_simulation(simulation_id)
);

-- Submitting decisions: only as yourself, only for your own group, only for
-- the NEXT period, only while the cohort is running and the period is open,
-- and never for an exited venture. The unique key makes it once per period.
drop policy if exists simulation_decisions_submit on simulation_decisions;
create policy simulation_decisions_submit on simulation_decisions for insert with check (
  submitted_by_student_id = app_current_student_id()
  and exists (
    select 1 from simulations s
    join simulation_cohorts c on c.id = s.cohort_id
    where s.id = simulation_decisions.simulation_id
      and app_is_active_group_member(s.group_id)
      and s.status <> 'exited'
      and s.completed_period + 1 = simulation_decisions.period
      and simulation_decisions.period <= c.open_through_period
      and c.status = 'running'
  )
);
