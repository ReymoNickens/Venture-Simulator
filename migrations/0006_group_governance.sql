-- Group governance: members who leave or go inactive, group decisions that
-- need a majority rather than one student's click, and per-offering AI caps.

-- ── Course configuration ──────────────────────────────────────────────────
alter table course_offerings add column if not exists ai_daily_student_limit int not null default 25;
alter table course_offerings add column if not exists ai_daily_group_limit int not null default 120;
-- Percentage of ACTIVE members who must endorse a venture proposal.
alter table course_offerings add column if not exists decision_quorum_pct int not null default 51;

-- ── Membership status history ─────────────────────────────────────────────
-- membership_status: 'active' | 'left' (student chose to leave) |
-- 'inactive' (lecturer marked them as not participating). Neither counts
-- toward "every active member must submit", so one absent student can no
-- longer freeze nine others.
alter table group_members add column if not exists status_reason text;
alter table group_members add column if not exists status_changed_at timestamptz;
alter table group_members add column if not exists status_changed_by text;

-- ── Venture proposals (propose → endorse/object → ratified) ───────────────
create table if not exists venture_proposals (
  id text primary key,
  group_id text not null references groups(id),
  opportunity_id text not null references opportunities(id),
  proposed_by_student_id text not null references students(id),
  name text not null,
  rationale text not null,
  -- 'open' | 'ratified' | 'rejected' | 'withdrawn'
  status text not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venture_proposals_group_idx on venture_proposals (group_id);
-- At most one open proposal per group at a time.
create unique index if not exists venture_proposals_one_open
  on venture_proposals (group_id) where status = 'open';

create table if not exists proposal_votes (
  id text primary key,
  proposal_id text not null references venture_proposals(id),
  student_id text not null references students(id),
  -- 'endorse' | 'object'
  vote text not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, student_id)
);
create index if not exists proposal_votes_proposal_idx on proposal_votes (proposal_id);

alter table ventures add column if not exists proposal_id text references venture_proposals(id);

alter table venture_proposals enable row level security;
alter table proposal_votes enable row level security;

drop policy if exists venture_proposals_member on venture_proposals;
create policy venture_proposals_member on venture_proposals for select using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
);
drop policy if exists venture_proposals_write on venture_proposals;
create policy venture_proposals_write on venture_proposals for insert with check (
  app_bypass_rls() or app_has_privileged_role()
  or (app_is_active_group_member(group_id) and proposed_by_student_id = app_current_student_id())
);
drop policy if exists venture_proposals_update on venture_proposals;
create policy venture_proposals_update on venture_proposals for update using (
  app_bypass_rls() or app_has_privileged_role()
  or app_is_active_group_member(group_id)
);

drop policy if exists proposal_votes_member on proposal_votes;
create policy proposal_votes_member on proposal_votes for select using (
  app_bypass_rls() or app_has_privileged_role()
  or exists (
    select 1 from venture_proposals p
    where p.id = proposal_votes.proposal_id and app_is_active_group_member(p.group_id)
  )
);
drop policy if exists proposal_votes_write on proposal_votes;
create policy proposal_votes_write on proposal_votes for all using (
  app_bypass_rls() or app_has_privileged_role()
  or student_id = app_current_student_id()
) with check (
  app_bypass_rls() or app_has_privileged_role()
  or (
    student_id = app_current_student_id()
    and exists (
      select 1 from venture_proposals p
      where p.id = proposal_votes.proposal_id and app_is_active_group_member(p.group_id)
    )
  )
);

grant select, insert, update, delete on venture_proposals, proposal_votes to app_runtime;
