-- Raising the money to open: each group plays the fundraising game
-- (src/lib/game/fundraise.ts) before its venture can open, and what it raised
-- becomes the venture's starting cash and debts.
--
-- fundraising holds one shared game per group. Every move is computed by the
-- server from the pure rules and written with the RLS bypass, so students can
-- read their group's game but never write a state of their own making.
-- Lecturers of the class can read it.
--
-- simulations.opening_financing keeps the loans the group raised; they are
-- in place before week 1 and repaid with interest from week 1.
--
-- Safe to run twice.

create table if not exists fundraising (
  group_id text primary key references groups(id),
  state jsonb not null,
  started_by_student_id text references students(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table fundraising enable row level security;

drop policy if exists fundraising_read on fundraising;
create policy fundraising_read on fundraising for select using (
  app_bypass_rls() or app_is_admin()
  or app_is_active_group_member(group_id)
  or app_is_lecturer_for_group(group_id)
);
drop policy if exists fundraising_system_write on fundraising;
create policy fundraising_system_write on fundraising for all
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());

alter table simulations add column if not exists opening_financing jsonb;
