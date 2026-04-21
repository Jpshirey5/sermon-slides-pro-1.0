alter table public.accounts
  add column if not exists is_beta_user boolean not null default false,
  add column if not exists beta_started_at timestamptz,
  add column if not exists beta_trial_ends_at timestamptz,
  add column if not exists beta_plan_tier text not null default 'pro',
  add column if not exists beta_day_10_email_sent_at timestamptz,
  add column if not exists beta_day_25_email_sent_at timestamptz,
  add column if not exists beta_day_30_email_sent_at timestamptz;

alter table public.accounts
  drop constraint if exists accounts_beta_plan_tier_check;

alter table public.accounts
  add constraint accounts_beta_plan_tier_check
  check (beta_plan_tier in ('pro', 'team', 'enterprise'));

create index if not exists idx_accounts_beta_trial
  on public.accounts (is_beta_user, beta_trial_ends_at)
  where is_beta_user = true;

drop view if exists public.accounts_public;

create view public.accounts_public as
select
  id,
  name,
  created_at,
  updated_at,
  subscription_status,
  city,
  state,
  plan_tier,
  billing_interval,
  max_additional_users,
  is_beta_user,
  beta_started_at,
  beta_trial_ends_at,
  beta_plan_tier
from public.accounts;

grant select on public.accounts_public to authenticated;
