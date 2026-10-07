-- Sign-in by phone number (SMS code) or Google, and one group per person.
--
-- Group leaders and members now sign themselves up: a phone number and a
-- texted code (Better Auth's phone-number plugin, which needs the two "user"
-- columns below) or Google. They then give their details (name, index
-- number, programme, email, phone), which create their students row.
--
-- One person, one group: students already have unique index numbers (0002)
-- and emails (0006); phone numbers become unique too, and a student can be
-- an active member of only one group. The unique indexes are created inside
-- exception handlers so a database with old duplicate test rows still
-- migrates (the server checks the same rules with friendly messages).
--
-- While no SMS provider is configured, codes are held in pending_sms_codes
-- for the platform owner to read on the owner page, so the flow can be tried
-- before the Arkesel account is live. Nothing is stored once SMS is on.
--
-- Safe to run twice.

alter table "user" add column if not exists "phoneNumber" text;
alter table "user" add column if not exists "phoneNumberVerified" boolean;
create unique index if not exists user_phone_number_idx on "user" ("phoneNumber") where "phoneNumber" is not null;

alter table students add column if not exists phone text;

do $$
begin
  create unique index if not exists students_phone_idx on students (phone) where phone is not null;
exception when unique_violation then
  raise notice 'students_phone_idx not created: duplicate phone numbers exist';
end $$;

do $$
begin
  create unique index if not exists group_members_one_active_group_idx
    on group_members (student_id) where membership_status = 'active';
exception when unique_violation then
  raise notice 'group_members_one_active_group_idx not created: a student is active in two groups';
end $$;

create table if not exists pending_sms_codes (
  id text primary key,
  phone text not null,
  message text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists pending_sms_codes_created_idx on pending_sms_codes (created_at desc);
alter table pending_sms_codes enable row level security;
drop policy if exists pending_sms_codes_system on pending_sms_codes;
create policy pending_sms_codes_system on pending_sms_codes for all
  using (app_bypass_rls() or app_is_admin())
  with check (app_bypass_rls() or app_is_admin());
