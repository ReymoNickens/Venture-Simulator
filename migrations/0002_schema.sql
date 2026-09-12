-- Experiential Venture Platform — Slice 1 schema
-- IDs are text UUIDs generated in application code (no pgcrypto required).
-- students.auth_user_id is TEXT to match Better Auth user ids.

create table if not exists app_roles (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app_roles (id, name) values
  ('role_student', 'student'),
  ('role_lecturer', 'lecturer'),
  ('role_admin', 'admin')
on conflict (id) do nothing;

create table if not exists user_roles (
  id text primary key,
  user_id text not null,
  role_id text not null references app_roles(id),
  course_offering_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists user_roles_unique on user_roles (user_id, role_id, course_offering_id);

create table if not exists platform_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into platform_settings (key, value) values
  ('app_name', 'Experiential Venture Platform'),
  ('default_group_size', '10'),
  ('max_photo_bytes', '800000')
on conflict (key) do nothing;

create table if not exists courses (
  id text primary key,
  course_code text not null unique,
  course_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists course_offerings (
  id text primary key,
  course_id text not null references courses(id),
  semester text not null,
  academic_year text not null,
  default_group_size int not null default 10,
  selection_requires_all_active boolean not null default true,
  max_photo_bytes int not null default 800000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists course_offerings_course_idx on course_offerings (course_id);

create table if not exists students (
  id text primary key,
  auth_user_id text not null unique,
  full_name text not null,
  index_number text not null,
  programme text not null,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists students_index_number_idx on students (index_number);

create table if not exists course_enrolments (
  id text primary key,
  student_id text not null references students(id),
  course_offering_id text not null references course_offerings(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_offering_id)
);
create index if not exists enrolments_offering_idx on course_enrolments (course_offering_id);

create table if not exists groups (
  id text primary key,
  course_offering_id text not null references course_offerings(id),
  group_name text not null,
  group_number int not null,
  join_code text not null unique,
  status text not null default 'forming',
  created_by_student_id text references students(id),
  capacity int not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists groups_offering_idx on groups (course_offering_id);
create unique index if not exists groups_number_per_offering on groups (course_offering_id, group_number);

create table if not exists group_members (
  id text primary key,
  group_id text not null references groups(id),
  student_id text not null references students(id),
  membership_status text not null default 'active',
  joined_at timestamptz not null default now(),
  unique (group_id, student_id)
);
create index if not exists group_members_student_idx on group_members (student_id);

create table if not exists opportunities (
  id text primary key,
  student_id text not null references students(id),
  group_id text not null references groups(id),
  problem text not null default '',
  affected_people text not null default '',
  context text not null default '',
  observed_evidence text not null default '',
  current_alternatives text not null default '',
  why_it_matters text not null default '',
  possible_solution text not null default '',
  potential_customer text not null default '',
  revenue_mechanism text not null default '',
  uncertainties text not null default '',
  status text not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, group_id)
);
create index if not exists opportunities_group_idx on opportunities (group_id);

create table if not exists opportunity_revisions (
  id text primary key,
  opportunity_id text not null references opportunities(id),
  snapshot text not null,
  created_at timestamptz not null default now()
);
create index if not exists opportunity_revisions_opp_idx on opportunity_revisions (opportunity_id);

create table if not exists opportunity_preferences (
  id text primary key,
  opportunity_id text not null references opportunities(id),
  student_id text not null references students(id),
  preference_rank int not null default 1,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, opportunity_id)
);
create index if not exists opportunity_preferences_student_idx on opportunity_preferences (student_id);

create table if not exists ventures (
  id text primary key,
  group_id text not null unique references groups(id),
  opportunity_id text not null references opportunities(id),
  name text not null,
  status text not null default 'active',
  selection_rationale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evidence_items (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  title text not null,
  content text not null default '',
  source_type text not null,
  classification text not null default 'unknown',
  photo_data text,
  photo_mime text,
  observed_at text,
  location_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists evidence_items_venture_idx on evidence_items (venture_id);

create table if not exists assumptions (
  id text primary key,
  venture_id text not null references ventures(id),
  student_id text not null references students(id),
  statement text not null,
  importance text not null default 'medium',
  confidence text not null default 'low',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assumptions_venture_idx on assumptions (venture_id);

create table if not exists assumption_evidence (
  id text primary key,
  assumption_id text not null references assumptions(id),
  evidence_item_id text not null references evidence_items(id),
  relationship_type text not null default 'supports',
  created_by_student_id text not null references students(id),
  created_at timestamptz not null default now(),
  unique (assumption_id, evidence_item_id, relationship_type)
);

create table if not exists ai_advisor_sessions (
  id text primary key,
  venture_id text references ventures(id),
  group_id text not null references groups(id),
  stage text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_sessions_group_idx on ai_advisor_sessions (group_id);

create table if not exists ai_advisor_messages (
  id text primary key,
  session_id text not null references ai_advisor_sessions(id),
  venture_id text,
  group_id text not null references groups(id),
  student_id text references students(id),
  role text not null,
  content text not null,
  metadata text,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_session_idx on ai_advisor_messages (session_id);

create table if not exists activity_events (
  id text primary key,
  student_id text,
  group_id text,
  venture_id text,
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata text,
  created_at timestamptz not null default now()
);
create index if not exists activity_events_group_idx on activity_events (group_id);
create index if not exists activity_events_student_idx on activity_events (student_id);

create table if not exists sync_conflicts (
  id text primary key,
  student_id text not null references students(id),
  entity_type text not null,
  entity_id text not null,
  local_snapshot text not null,
  server_snapshot text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
