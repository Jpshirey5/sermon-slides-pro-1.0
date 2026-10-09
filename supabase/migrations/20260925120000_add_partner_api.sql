-- Partner API (v1): partner registry, API keys, provisioned seats, themes,
-- single-use handoff tokens, idempotency, rate counters, and request logs.
--
-- Every partner_* table is service-role only: RLS is enabled with NO policies,
-- and table privileges are revoked from anon/authenticated as a second fence.
-- The partner-api / partner-handoff / partner-approve edge functions are the
-- only readers and writers.

create extension if not exists pgcrypto;

-- ── partners ────────────────────────────────────────────────────────────────

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  contact_email text not null,
  is_test boolean not null default false,
  allowed_return_hosts text[] not null default '{}',
  rate_limit_per_min integer not null default 120 check (rate_limit_per_min > 0),
  deck_limit_per_day integer not null default 200 check (deck_limit_per_day > 0),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  -- 8-char public lookup prefix; the only part of a key ever logged.
  key_prefix text not null unique check (key_prefix ~ '^[a-z0-9]{8}$'),
  -- sha256(full key), hex. The plaintext key is never stored.
  key_hash text not null,
  -- sha256(signing secret), hex. The plaintext lives only in the edge function
  -- env (PARTNER_SIGNING_SECRET_<PREFIX>), so a database leak cannot forge signatures.
  signing_secret_hash text not null,
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists partner_api_keys_partner_idx on public.partner_api_keys (partner_id);

-- ── seats ───────────────────────────────────────────────────────────────────

create table if not exists public.partner_themes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  external_theme_id text not null,
  church_name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, external_theme_id)
);

create table if not exists public.partner_accounts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  external_user_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null default 'core',
  entitlement_status text not null default 'active' check (entitlement_status in ('active', 'revoked')),
  theme_id uuid references public.partner_themes(id) on delete set null,
  provisioned_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, external_user_id),
  unique (partner_id, user_id)
);

create index if not exists partner_accounts_user_idx on public.partner_accounts (user_id);

-- Short-lived gate for the handle_new_user trigger. The partner-api function
-- inserts a row immediately before auth.admin.createUser and passes the token
-- in user metadata; the trigger only takes the partner branch when the hash
-- matches an unconsumed, unexpired row for that exact email. Metadata alone
-- is attacker-controlled on public signUp, so it is never trusted by itself.
create table if not exists public.partner_provision_tokens (
  token_hash text primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  email text not null,
  entitlement text not null default 'core',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── handoff ─────────────────────────────────────────────────────────────────

create table if not exists public.handoff_tokens (
  id uuid primary key default gen_random_uuid(),
  -- sha256(token), hex. The raw token only ever exists in the partner's hands.
  token_hash text not null unique,
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid references public.sermons(id) on delete set null,
  return_url text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_ip text,
  created_at timestamptz not null default now()
);

create index if not exists handoff_tokens_user_partner_idx
  on public.handoff_tokens (user_id, partner_id, consumed_at desc);
create index if not exists handoff_tokens_expires_idx on public.handoff_tokens (expires_at);

-- ── request plumbing ────────────────────────────────────────────────────────

create table if not exists public.partner_idempotency (
  partner_id uuid not null references public.partners(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  response_status integer not null,
  -- The exact serialized response, as text: jsonb would reorder keys and a
  -- replay must be byte-identical to the original.
  response_body text not null,
  created_at timestamptz not null default now(),
  primary key (partner_id, idempotency_key)
);

create table if not exists public.partner_rate_counters (
  partner_id uuid not null references public.partners(id) on delete cascade,
  bucket text not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (partner_id, bucket)
);

create table if not exists public.partner_api_log (
  id bigint generated always as identity primary key,
  request_id text not null,
  partner_id uuid references public.partners(id) on delete set null,
  method text not null,
  path text not null,
  status integer not null,
  external_user_id text,
  idempotency_key text,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists partner_api_log_partner_created_idx on public.partner_api_log (partner_id, created_at desc);
create index if not exists partner_api_log_created_idx on public.partner_api_log (created_at);

-- ── exports ─────────────────────────────────────────────────────────────────

create table if not exists public.partner_exports (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deck_id uuid not null references public.sermons(id) on delete cascade,
  formats text[] not null,
  status text not null default 'queued' check (status in ('queued', 'generating', 'ready', 'failed')),
  -- [{ format, path, bytes }] — storage paths only. Signed URLs are minted per read.
  files jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_exports_deck_idx on public.partner_exports (deck_id, created_at desc);

-- ── existing tables ─────────────────────────────────────────────────────────
-- Decks are public.sermons in this codebase (there is no decks table).

alter table public.sermons
  add column if not exists partner_id uuid references public.partners(id) on delete set null,
  add column if not exists partner_external_user_id text,
  add column if not exists approved_at timestamptz,
  -- null for every non-partner sermon; partner decks move queued → generating → ready | failed.
  add column if not exists generation_status text
    check (generation_status is null or generation_status in ('queued', 'generating', 'ready', 'failed')),
  add column if not exists generation_error text,
  -- Deterministic completeness inputs recorded at generation time.
  add column if not exists generation_stats jsonb;

create index if not exists sermons_partner_created_idx
  on public.sermons (partner_id, created_at desc)
  where partner_id is not null;

-- Billing flag that check-subscription honours and create-checkout refuses on.
alter table public.accounts
  add column if not exists partner_billing_active boolean not null default false,
  add column if not exists partner_plan_tier text;

-- ── lock down ───────────────────────────────────────────────────────────────

do $$
declare
  _table text;
begin
  foreach _table in array array[
    'partners', 'partner_api_keys', 'partner_accounts', 'partner_themes',
    'partner_provision_tokens', 'handoff_tokens', 'partner_idempotency',
    'partner_rate_counters', 'partner_api_log', 'partner_exports'
  ]
  loop
    execute format('alter table public.%I enable row level security', _table);
    execute format('revoke all on public.%I from anon, authenticated', _table);
  end loop;
end;
$$;

-- ── functions ───────────────────────────────────────────────────────────────

-- Fixed-window per-minute counter. Returns true while the request is within limit.
create or replace function public.partner_rate_take(p_partner uuid, p_bucket text, p_limit int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.partner_rate_counters as c (partner_id, bucket, count)
  values (p_partner, p_bucket, 1)
  on conflict (partner_id, bucket) do update set count = c.count + 1
  returning c.count <= p_limit;
$$;

revoke execute on function public.partner_rate_take(uuid, text, int) from public, anon, authenticated;

-- Validate AND consume in one statement. The WHERE clause is the security:
-- a token that is unknown, already consumed, or expired matches zero rows, and
-- two concurrent consumers cannot both win because the UPDATE takes a row lock.
create or replace function public.consume_handoff_token(p_token_hash text)
returns table (user_id uuid, deck_id uuid, return_url text, partner_id uuid)
language sql
security definer
set search_path = public
as $$
  update public.handoff_tokens as t
  set consumed_at = now()
  where t.token_hash = p_token_hash
    and t.consumed_at is null
    and t.expires_at > now()
  returning t.user_id, t.deck_id, t.return_url, t.partner_id;
$$;

revoke execute on function public.consume_handoff_token(text) from public, anon, authenticated;

-- The admin auth API has no get-by-email; this is the exact, indexed lookup.
create or replace function public.partner_find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1;
$$;

revoke execute on function public.partner_find_user_id_by_email(text) from public, anon, authenticated;

-- Housekeeping. Scheduled nightly below when pg_cron is available; if it is not,
-- schedule `select public.partner_api_gc();` nightly by other means.
create or replace function public.partner_api_gc()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.handoff_tokens where expires_at < now() - interval '1 day';
  delete from public.partner_provision_tokens where expires_at < now() - interval '1 day';
  delete from public.partner_idempotency where created_at < now() - interval '30 days';
  delete from public.partner_rate_counters where created_at < now() - interval '1 hour';
  delete from public.partner_api_log where created_at < now() - interval '90 days';
end;
$$;

revoke execute on function public.partner_api_gc() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when insufficient_privilege or undefined_file or feature_not_supported then
      raise notice 'pg_cron unavailable; partner_api_gc created without automatic scheduling.';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'partner-api-gc-nightly') then
      perform cron.schedule(
        'partner-api-gc-nightly',
        '45 4 * * *',
        $job$select public.partner_api_gc();$job$
      );
    end if;
  end if;
end;
$$;

-- ── signup trigger: partner-provisioned branch ──────────────────────────────
-- Same body as 20260429134500_fix_paid_signup_trigger_digest_schema.sql plus a
-- partner branch ahead of the paid-signup requirement.

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
  _partner_token text;
  _partner_provision public.partner_provision_tokens%rowtype;
  _new_account_id uuid;
begin
    _invite_token := NEW.raw_user_meta_data ->> 'invite_token';
    _admin_invite_token := NEW.raw_user_meta_data ->> 'admin_invite_token';
    _signup_intent := NEW.raw_user_meta_data ->> 'signup_intent';
    _paid_signup_token := NEW.raw_user_meta_data ->> 'paid_signup_token';
    _partner_token := NEW.raw_user_meta_data ->> 'partner_provision_token';

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

    if _signup_intent = 'partner_provisioned' and _partner_token is not null and _partner_token != '' then
      update public.partner_provision_tokens
      set consumed_at = now()
      where token_hash = encode(extensions.digest(_partner_token, 'sha256'), 'hex')
        and consumed_at is null
        and expires_at > now()
        and lower(email) = lower(coalesce(NEW.email, ''))
      returning * into _partner_provision;

      if not found then
        raise exception 'Partner provisioning token is invalid, expired, or already used';
      end if;

      perform public.ensure_profile_exists(
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.email,
        NEW.raw_user_meta_data ->> 'church_role'
      );

      insert into public.accounts (
        name,
        signup_status,
        plan_tier,
        max_additional_users,
        subscription_status,
        partner_billing_active,
        partner_plan_tier
      )
      values (
        coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'org_name'), ''), 'My Church'),
        'active',
        _partner_provision.entitlement,
        0,
        'active',
        true,
        _partner_provision.entitlement
      )
      returning id into _new_account_id;

      insert into public.account_members (account_id, user_id, role, accepted_at)
      values (_new_account_id, NEW.id, 'owner', now());

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

-- ── storage ─────────────────────────────────────────────────────────────────
-- Private bucket for generated export files. No storage.objects policies are
-- added, so only the service role can read or write; partners receive
-- short-lived signed URLs minted per GET /exports/{id}.

insert into storage.buckets (id, name, public, file_size_limit)
values ('partner-exports', 'partner-exports', false, 104857600)
on conflict (id) do nothing;
