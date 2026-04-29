alter table public.accounts
  add column if not exists signup_status text not null default 'active';

update public.accounts
set signup_status = 'active'
where signup_status is null;

alter table public.accounts
  drop constraint if exists accounts_signup_status_check;

alter table public.accounts
  add constraint accounts_signup_status_check
  check (signup_status in ('active', 'pending_checkout'));

create index if not exists idx_accounts_signup_status
  on public.accounts (signup_status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _invite_token text;
  _admin_invite_token text;
  _signup_intent text;
  _new_account_id uuid;
begin
    _invite_token := NEW.raw_user_meta_data ->> 'invite_token';
    _admin_invite_token := NEW.raw_user_meta_data ->> 'admin_invite_token';
    _signup_intent := NEW.raw_user_meta_data ->> 'signup_intent';

    if _admin_invite_token is not null and _admin_invite_token != '' then
      perform public.ensure_profile_exists(
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.email,
        NEW.raw_user_meta_data ->> 'church_role'
      );
      return NEW;
    end if;

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

    insert into public.accounts (name, city, state, signup_status)
    values (
      coalesce(NEW.raw_user_meta_data ->> 'org_name', 'My Church'),
      NEW.raw_user_meta_data ->> 'org_city',
      NEW.raw_user_meta_data ->> 'org_state',
      case when _signup_intent = 'checkout' then 'pending_checkout' else 'active' end
    )
    returning id into _new_account_id;

    insert into public.account_members (account_id, user_id, role, accepted_at)
    values (_new_account_id, NEW.id, 'owner', now());

    return NEW;
end;
$function$;
