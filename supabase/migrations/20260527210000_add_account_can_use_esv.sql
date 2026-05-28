-- ESV is a license-restricted translation. Until commercial approval is granted,
-- it is gated to organizations explicitly entitled to it. This flag is the single
-- source of truth: flip it per account to grant/revoke ESV access.
alter table public.accounts
  add column if not exists can_use_esv boolean not null default false;

-- Grant ESV to Bell Shoals Church, the one org currently licensed to use it.
-- Case-insensitive match guards against minor spelling/casing differences.
update public.accounts
  set can_use_esv = true
  where lower(name) like 'bell shoals%';

-- Expose the flag through the client-readable view. security_invoker = on keeps
-- the caller's RLS in force (members only see their own account), matching the
-- existing accounts_public contract.
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
  beta_plan_tier,
  can_use_esv
from public.accounts;

grant select on public.accounts_public to authenticated;
