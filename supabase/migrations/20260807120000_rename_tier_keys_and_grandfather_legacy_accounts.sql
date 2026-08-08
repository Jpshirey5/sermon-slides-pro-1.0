-- Pricing restructure, step 1: rename internal tier keys
--   old "pro"        -> new "free"
--   old "team"        -> new "core"
--   old "enterprise"  -> new "team"
--
-- IMPORTANT ORDERING NOTE ON THE RENAME MAPPING:
-- Old "team" and new "team" are DIFFERENT tiers (old team -> core, old
-- enterprise -> new team). All renames below use a single CASE expression
-- evaluated against the OLD value of each row in one statement, so a row can
-- never be read after it has already been rewritten by an earlier branch of
-- the same CASE. This makes the rename immune to the classic
-- A-becomes-B/B-becomes-C collision that a sequence of separate UPDATE
-- statements would risk.

-- ---------------------------------------------------------------------------
-- Step 0: grandfather existing (pre-restructure) accounts BEFORE their
-- plan_tier is rewritten below, so a later step can give them their original
-- per-user generation cap instead of the new tier's shared cap.
--
-- Per explicit confirmation from the product owner, every account currently
-- in the database is one of the 3 comped (100%-off Stripe coupon) accounts
-- that needs this protection -- there is no separate Stripe/DB lookup
-- performed by this migration. This migration grandfathers every account
-- that exists at the moment it is APPLIED (not the moment it was written).
-- If more accounts have signed up in between, they will be grandfathered too
-- -- check the NOTICE output when you run this migration (or query
-- `select id, plan_tier, is_legacy_grandfathered from public.accounts where
-- is_legacy_grandfathered` afterwards) before trusting this in production.
-- ---------------------------------------------------------------------------

alter table public.accounts
  add column if not exists legacy_uncapped_tier text,
  add column if not exists is_legacy_grandfathered boolean not null default false;

do $$
declare
  _tagged record;
  _count integer;
begin
  update public.accounts
  set legacy_uncapped_tier = plan_tier,
      is_legacy_grandfathered = true
  where is_legacy_grandfathered = false;

  get diagnostics _count = row_count;
  raise notice 'Grandfathered % account(s); verify this count and the list below match the 3 comped accounts you expect:', _count;

  for _tagged in
    select
      a.id,
      a.plan_tier as original_plan_tier,
      coalesce(p.email, '(no owner profile found)') as owner_email
    from public.accounts a
    left join public.account_members am on am.account_id = a.id and am.role = 'owner'
    left join public.profiles p on p.id = am.user_id
    where a.is_legacy_grandfathered = true
    order by a.created_at asc
  loop
    raise notice '  account_id=% original_plan_tier=% owner_email=%',
      _tagged.id, _tagged.original_plan_tier, _tagged.owner_email;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Step 1: update DB functions to check the new tier keys BEFORE the data
-- rename runs, so the `ensure_enterprise_main_campus_after_account_change`
-- trigger (which fires on the accounts.plan_tier UPDATE below) already
-- evaluates against the new key when that UPDATE executes.
--
-- Logic is otherwise unchanged from the prior version of each function.
-- Human-readable exception message text intentionally still says
-- "Team"/"Enterprise" in a few spots below -- that's UI/copy-facing text,
-- out of scope for this step, and will be updated in a later pricing-copy
-- pass along with the rest of the customer-facing wording.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_account_invite_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  non_owner_member_count integer;
  active_pending_invite_count integer;
  account_plan_tier text;
begin
  select plan_tier
  into account_plan_tier
  from public.accounts
  where id = NEW.account_id;

  account_plan_tier := coalesce(account_plan_tier, 'free');

  if account_plan_tier = 'free' then
    raise exception 'account invite limit reached'
      using errcode = 'P0001',
            detail = 'Your current plan does not include collaborative user invites.';
  end if;

  if account_plan_tier = 'team' then
    return NEW;
  end if;

  if account_plan_tier <> 'core' then
    -- Unrecognized tier: deny rather than silently falling through to the
    -- 2-seat cap below (the old behavior here was an implicit "else",
    -- which would have quietly treated any unrecognized tier as if it were
    -- the old Team plan).
    raise exception 'account invite limit reached'
      using errcode = 'P0001',
            detail = 'Unrecognized plan tier does not support additional invites.';
  end if;

  select count(*)
  into non_owner_member_count
  from public.account_members
  where account_id = NEW.account_id
    and role = 'member';

  select count(*)
  into active_pending_invite_count
  from public.account_invites
  where account_id = NEW.account_id
    and expires_at > now();

  if non_owner_member_count + active_pending_invite_count >= 2 then
    raise exception 'account invite limit reached'
      using errcode = 'P0001',
            detail = 'Team plans include up to 2 additional users, including active pending invites.';
  end if;

  return NEW;
end;
$$;

create or replace function public.ensure_enterprise_main_campus_for_account(_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan_tier text;
  existing_primary_id uuid;
  existing_campus_id uuid;
  next_campus_id uuid;
begin
  select coalesce(plan_tier, 'free')
  into account_plan_tier
  from public.accounts
  where id = _account_id;

  if account_plan_tier <> 'team' then
    return null;
  end if;

  select id
  into existing_primary_id
  from public.campuses
  where account_id = _account_id
    and is_primary = true
  order by created_at asc
  limit 1;

  if existing_primary_id is not null then
    return existing_primary_id;
  end if;

  select id
  into existing_campus_id
  from public.campuses
  where account_id = _account_id
  order by created_at asc
  limit 1;

  if existing_campus_id is not null then
    update public.campuses
    set is_primary = true
    where id = existing_campus_id;

    return existing_campus_id;
  end if;

  insert into public.campuses (account_id, name, is_primary)
  values (_account_id, 'Main Campus', true)
  returning id into next_campus_id;

  return next_campus_id;
end;
$$;

create or replace function public.enforce_campus_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan_tier text;
  campus_count integer;
begin
  new.name := btrim(new.name);

  if new.name = '' then
    raise exception 'Campus name is required'
      using errcode = 'P0001';
  end if;

  select coalesce(plan_tier, 'free')
  into account_plan_tier
  from public.accounts
  where id = new.account_id;

  if account_plan_tier <> 'team' then
    raise exception 'Campuses are only available on Enterprise plans'
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    into campus_count
    from public.campuses
    where account_id = new.account_id;

    if campus_count >= 5 then
      raise exception 'Enterprise accounts can have up to 5 campuses'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.ensure_enterprise_main_campus_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.plan_tier, 'free') = 'team' then
    perform public.ensure_enterprise_main_campus_for_account(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.validate_sermon_campus_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan_tier text;
  campus_account_id uuid;
begin
  new.former_campus_name := nullif(btrim(coalesce(new.former_campus_name, '')), '');

  select coalesce(plan_tier, 'free')
  into account_plan_tier
  from public.accounts
  where id = new.account_id;

  if new.campus_id is not null then
    select account_id
    into campus_account_id
    from public.campuses
    where id = new.campus_id;

    if campus_account_id is null then
      raise exception 'Selected campus does not exist'
        using errcode = 'P0001';
    end if;

    if campus_account_id <> new.account_id then
      raise exception 'Selected campus does not belong to this account'
        using errcode = 'P0001';
    end if;
  end if;

  if account_plan_tier = 'team' and new.campus_id is null then
    raise exception 'Enterprise presentations require a campus'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.set_enterprise_account_default_translation(
  _account_id uuid,
  _translation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _plan_tier text;
  _normalized_translation text;
begin
  if not public.is_account_owner(auth.uid(), _account_id) then
    raise exception 'Only the account owner can update the Enterprise default translation'
      using errcode = 'P0001';
  end if;

  select coalesce(plan_tier, 'free')
  into _plan_tier
  from public.accounts
  where id = _account_id;

  if _plan_tier <> 'team' then
    raise exception 'Enterprise translation inheritance is only available on Enterprise accounts'
      using errcode = 'P0001';
  end if;

  _normalized_translation := nullif(btrim(coalesce(_translation, '')), '');

  if _normalized_translation is null then
    raise exception 'Default translation is required'
      using errcode = 'P0001';
  end if;

  update public.profiles p
  set default_translation = _normalized_translation
  from public.account_members am
  where am.account_id = _account_id
    and am.user_id = p.id;
end;
$$;

create or replace function public.complete_invited_user_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _invite_token text;
  _invite_account_id uuid;
  _account_plan_tier text;
  _owner_default_translation text;
begin
  _invite_token := NEW.raw_user_meta_data ->> 'invite_token';

  if _invite_token is null or _invite_token = '' then
    return NEW;
  end if;

  if NEW.email_confirmed_at is null then
    return NEW;
  end if;

  if OLD.email_confirmed_at is not distinct from NEW.email_confirmed_at then
    return NEW;
  end if;

  select account_id into _invite_account_id
  from public.account_invites
  where token = _invite_token
    and expires_at > now()
  limit 1;

  perform public.ensure_profile_exists(
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'church_role'
  );

  if _invite_account_id is null then
    return NEW;
  end if;

  select coalesce(plan_tier, 'free')
  into _account_plan_tier
  from public.accounts
  where id = _invite_account_id;

  if _account_plan_tier = 'team' then
    select p.default_translation
    into _owner_default_translation
    from public.account_members am
    join public.profiles p on p.id = am.user_id
    where am.account_id = _invite_account_id
      and am.role = 'owner'
      and p.default_translation is not null
    order by am.created_at asc
    limit 1;

    if _owner_default_translation is not null then
      update public.profiles
      set default_translation = _owner_default_translation
      where id = NEW.id;
    end if;
  end if;

  insert into public.account_members (account_id, user_id, role, accepted_at)
  values (_invite_account_id, NEW.id, 'member', now())
  on conflict (account_id, user_id) do update
  set accepted_at = coalesce(public.account_members.accepted_at, excluded.accepted_at);

  delete from public.account_invites
  where token = _invite_token;

  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Step 2: rename the stored tier values themselves. Functions above are
-- already updated, so the ensure_enterprise_main_campus_after_account_change
-- trigger fired by the accounts UPDATE below evaluates against the new keys.
-- ---------------------------------------------------------------------------

-- Crafted Network (Koby Dickinson, account id 339a7433-e87b-4617-a1d0-323af03725f7)
-- is a known exception to the blind rename below: his row's plan_tier was
-- already hand-corrected from old-scheme "enterprise" to new-scheme "team"
-- (confirmed against his original 2026-07-01 paid_signup_sessions record,
-- which shows old-scheme "enterprise"/9 additional users, and his current
-- max_additional_users of 9 which only makes sense under the new "team"
-- tier). The CASE below can't distinguish his already-new-scheme "team"
-- from an unmigrated old-scheme "team", so his account is excluded here to
-- avoid demoting him to "core".
update public.accounts
set plan_tier = case plan_tier
  when 'pro' then 'free'
  when 'team' then 'core'
  when 'enterprise' then 'team'
  else plan_tier
end
where id <> '339a7433-e87b-4617-a1d0-323af03725f7';

-- accounts_beta_plan_tier_check only allows the OLD-scheme values
-- ('pro'/'team'/'enterprise'), so it must be dropped before the rename
-- below writes new-scheme values into the column, or the UPDATE itself
-- violates the still-active old constraint.
alter table public.accounts
  drop constraint if exists accounts_beta_plan_tier_check;

update public.accounts
set beta_plan_tier = case beta_plan_tier
  when 'pro' then 'free'
  when 'team' then 'core'
  when 'enterprise' then 'team'
  else beta_plan_tier
end;

-- Shiloh Baptist Association (account id 6bdfdb18-a4c0-4b8c-b302-f0b076b4cfc0)
-- has plan_tier already hand-corrected to new-scheme "core", but
-- beta_plan_tier was left at old-scheme "pro", which the CASE above just
-- renamed to "free" -- since check-subscription treats beta_plan_tier as
-- the source of truth for beta accounts and overwrites plan_tier from it on
-- every call, that would silently revert her back to "free". Per explicit
-- confirmation from the product owner, her intended tier is Core, so
-- beta_plan_tier is corrected to match here.
update public.accounts
set beta_plan_tier = 'core'
where id = '6bdfdb18-a4c0-4b8c-b302-f0b076b4cfc0';

alter table public.accounts
  alter column beta_plan_tier set default 'free';

alter table public.accounts
  add constraint accounts_beta_plan_tier_check
  check (beta_plan_tier in ('free', 'core', 'team'));

update public.paid_signup_sessions
set plan_tier = case plan_tier
  when 'pro' then 'free'
  when 'team' then 'core'
  when 'enterprise' then 'team'
  else plan_tier
end;

alter table public.paid_signup_sessions
  alter column plan_tier set default 'free';
