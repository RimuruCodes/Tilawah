-- Cloud backup of a user's on-device data (recitation logs, streaks,
-- memorization progress, feedback reports, recitation-plan state), so an
-- account's practice history can follow them to another device.
--
-- Design: the app stays local-first — the working copy lives in the browser
-- (see src/lib/localDb.js) and the app runs fully offline. This table holds a
-- single JSON snapshot per user (the same bundle src/lib/localDb.exportUserData
-- produces), pushed up when local data changes and pulled down on login. It is
-- deliberately whole-account "newest write wins", not a per-record merge — see
-- src/lib/dataSync.js. Unlike `subscriptions` (written only by the Stripe
-- webhook via service_role), this table is read AND written by the user
-- themselves, so it gets full own-row RLS.
create table if not exists user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_data enable row level security;

create policy "user_data select own"
  on user_data for select
  using (auth.uid() = user_id);

create policy "user_data insert own"
  on user_data for insert
  with check (auth.uid() = user_id);

create policy "user_data update own"
  on user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_data delete own"
  on user_data for delete
  using (auth.uid() = user_id);
