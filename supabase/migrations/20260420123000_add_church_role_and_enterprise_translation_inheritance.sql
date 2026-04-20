alter table public.profiles
  add column if not exists church_role text;

create or replace function public.ensure_profile_exists(
  _user_id uuid,
  _full_name text,
  _email text,
  _church_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, church_role)
  values (
    _user_id,
    nullif(btrim(coalesce(_full_name, '')), ''),
    _email,
    nullif(btrim(coalesce(_church_role, '')), '')
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    church_role = coalesce(excluded.church_role, public.profiles.church_role);
end;
$$;

create or replace function public.ensure_profile_exists(
  _user_id uuid,
  _full_name text,
  _email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_profile_exists(_user_id, _full_name, _email, null);
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

  if _plan_tier <> 'enterprise' then
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _invite_token text;
  _new_account_id uuid;
begin
    _invite_token := NEW.raw_user_meta_data ->> 'invite_token';

    if _invite_token is not null and _invite_token != '' then
      -- Supabase admin invites create the auth user record before acceptance.
      -- Defer profile and membership creation until the invite is accepted.
      return NEW;
    end if;

    perform public.ensure_profile_exists(
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.email,
      NEW.raw_user_meta_data ->> 'church_role'
    );

    insert into public.accounts (name, city, state)
    values (
      coalesce(NEW.raw_user_meta_data ->> 'org_name', 'My Church'),
      NEW.raw_user_meta_data ->> 'org_city',
      NEW.raw_user_meta_data ->> 'org_state'
    )
    returning id into _new_account_id;

    insert into public.account_members (account_id, user_id, role, accepted_at)
    values (_new_account_id, NEW.id, 'owner', now());

    return NEW;
end;
$function$;

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

  if _account_plan_tier = 'enterprise' then
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

with enterprise_owner_defaults as (
  select distinct on (am.account_id)
    am.account_id,
    p.default_translation
  from public.account_members am
  join public.accounts a on a.id = am.account_id
  join public.profiles p on p.id = am.user_id
  where coalesce(a.plan_tier, 'free') = 'enterprise'
    and am.role = 'owner'
    and p.default_translation is not null
  order by am.account_id, am.created_at asc
)
update public.profiles p
set default_translation = eod.default_translation
from public.account_members am
join enterprise_owner_defaults eod on eod.account_id = am.account_id
where p.id = am.user_id
  and am.role <> 'owner';
