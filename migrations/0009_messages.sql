-- Messages between teaching staff and groups.
--
-- One thread per group. A message with recipient_student_id is private to
-- that one student (and staff) — for "can we talk about your contribution"
-- conversations that should not happen in front of the group. Students can
-- reply to the group thread, or privately to staff within their own private
-- thread (recipient_student_id = themselves).

create table if not exists messages (
  id text primary key,
  group_id text not null references groups(id),
  author_staff_id text references staff(id),
  author_student_id text references students(id),
  recipient_student_id text references students(id),
  body text not null,
  created_at timestamptz not null default now(),
  check ((author_staff_id is null) <> (author_student_id is null))
);
create index if not exists messages_group_idx on messages (group_id, created_at);

create table if not exists message_reads (
  user_id text not null,
  group_id text not null references groups(id),
  last_read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table messages enable row level security;
alter table message_reads enable row level security;

drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (
  app_bypass_rls() or app_has_privileged_role()
  or (
    app_is_active_group_member(group_id)
    and (recipient_student_id is null or recipient_student_id = app_current_student_id())
  )
);

drop policy if exists messages_student_write on messages;
create policy messages_student_write on messages for insert with check (
  app_bypass_rls() or app_has_privileged_role()
  or (
    author_student_id = app_current_student_id()
    and author_staff_id is null
    and app_is_active_group_member(group_id)
    and (recipient_student_id is null or recipient_student_id = app_current_student_id())
  )
);

drop policy if exists message_reads_own on message_reads;
create policy message_reads_own on message_reads for all using (
  app_bypass_rls() or user_id = app_current_auth_user_id()
) with check (
  app_bypass_rls() or user_id = app_current_auth_user_id()
);

grant select, insert, update, delete on messages, message_reads to app_runtime;
