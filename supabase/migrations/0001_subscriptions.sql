-- Subscription entitlement, keyed to a Supabase Auth user (see
-- src/lib/entitlements.js for how this row is interpreted client-side, and
-- supabase/functions/stripe-webhook for the only writer).
create table if not exists subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan text check (plan in ('monthly', 'yearly')),
  status text not null default 'none', -- active, trialing, past_due, canceled, none
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- Users may only ever read their own row. There is deliberately no
-- insert/update/delete policy for the authenticated or anon roles — every
-- write happens via the service_role key inside the stripe-webhook Edge
-- Function, which is the single source of truth for entitlement state.
create policy "select own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);
