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
  insert into public.profiles (id, full_name, email)
  values (
    _user_id,
    nullif(btrim(coalesce(_full_name, '')), ''),
    _email
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email);
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
      NEW.email
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

  perform public.ensure_profile_exists(
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email
  );

  select account_id into _invite_account_id
  from public.account_invites
  where token = _invite_token
    and expires_at > now()
  limit 1;

  if _invite_account_id is null then
    return NEW;
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

drop trigger if exists on_auth_user_invite_accepted on auth.users;

create trigger on_auth_user_invite_accepted
  after update of email_confirmed_at on auth.users
  for each row execute function public.complete_invited_user_signup();
