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
  _paid_signup_token text;
  _paid_signup_token_hash text;
  _paid_signup public.paid_signup_sessions%rowtype;
  _new_account_id uuid;
begin
    _invite_token := NEW.raw_user_meta_data ->> 'invite_token';
    _admin_invite_token := NEW.raw_user_meta_data ->> 'admin_invite_token';
    _signup_intent := NEW.raw_user_meta_data ->> 'signup_intent';
    _paid_signup_token := NEW.raw_user_meta_data ->> 'paid_signup_token';

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

    if _signup_intent != 'paid_signup' or _paid_signup_token is null or _paid_signup_token = '' then
      raise exception 'Paid signup checkout is required before account creation';
    end if;

    _paid_signup_token_hash := encode(extensions.digest(_paid_signup_token, 'sha256'), 'hex');

    select *
    into _paid_signup
    from public.paid_signup_sessions
    where (token_hash = _paid_signup_token_hash or finish_token_hash = _paid_signup_token_hash)
      and status = 'paid'
      and completed_user_id is null
      and completed_account_id is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'Paid signup session is invalid, expired, or already used';
    end if;

    if lower(coalesce(NEW.email, '')) != lower(coalesce(_paid_signup.checkout_email, '')) then
      raise exception 'Signup email must match the email used at checkout';
    end if;

    perform public.ensure_profile_exists(
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.email,
      NEW.raw_user_meta_data ->> 'church_role'
    );

    insert into public.accounts (
      name,
      city,
      state,
      signup_status,
      plan_tier,
      billing_interval,
      max_additional_users,
      subscription_status,
      stripe_customer_id,
      stripe_subscription_id
    )
    values (
      coalesce(NEW.raw_user_meta_data ->> 'org_name', 'My Church'),
      NEW.raw_user_meta_data ->> 'org_city',
      NEW.raw_user_meta_data ->> 'org_state',
      'active',
      coalesce(_paid_signup.plan_tier, 'pro'),
      _paid_signup.billing_interval,
      coalesce(_paid_signup.max_additional_users, 0),
      'active',
      _paid_signup.stripe_customer_id,
      _paid_signup.stripe_subscription_id
    )
    returning id into _new_account_id;

    insert into public.account_members (account_id, user_id, role, accepted_at)
    values (_new_account_id, NEW.id, 'owner', now());

    update public.paid_signup_sessions
    set status = 'completed',
        completed_at = now(),
        completed_user_id = NEW.id,
        completed_account_id = _new_account_id
    where id = _paid_signup.id;

    return NEW;
end;
$function$;
