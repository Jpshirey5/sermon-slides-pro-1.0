-- Fix Supabase Security Definer View lint on public.accounts_public.
-- The 2026-04-21 beta-program migration recreated this view without
-- security_invoker=on, causing it to run with the owner's privileges
-- and bypass RLS on public.accounts. Restore security_invoker=on so
-- the view enforces the caller's RLS policies.

drop view if exists public.accounts_public;

create view public.accounts_public
with (security_invoker = on) as
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
