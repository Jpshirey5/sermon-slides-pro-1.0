// Minimal stand-ins for the Supabase-managed objects and pre-existing app
// tables the partner migration touches, so it can be applied to PGlite.
// Column sets mirror src/integrations/supabase/types.ts for the columns used.

import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { pgcrypto } from "npm:@electric-sql/pglite@0.5.8/contrib/pgcrypto";

export const MIGRATION_URL = new URL(
  "../../../../migrations/20260925120000_add_partner_api.sql",
  import.meta.url,
);

export const STUBS = `
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create role anon;
create role authenticated;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  encrypted_password text
);
create unique index auth_users_email_key on auth.users (lower(email));
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);

create type public.subscription_status as enum ('active', 'past_due', 'canceled', 'trialing', 'inactive');
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text, state text,
  signup_status text not null default 'active',
  plan_tier text,
  billing_interval text,
  max_additional_users int,
  subscription_status public.subscription_status not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);
create table public.account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  user_id uuid not null,
  role text not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.profiles (id uuid primary key, full_name text, email text, church_role text);
create table public.sermons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  created_by_user_id uuid,
  title text not null,
  scripture_reference text,
  slides jsonb not null default '[]'::jsonb,
  presentation_date date,
  creation_mode text check (creation_mode in ('structured_builder', 'quick_build')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger update_sermons_updated_at before update on public.sermons
  for each row execute function public.touch_updated_at();

create table public.paid_signup_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text, finish_token_hash text, status text, checkout_email text,
  completed_user_id uuid, completed_account_id uuid, completed_at timestamptz,
  expires_at timestamptz, plan_tier text, billing_interval text,
  max_additional_users int, stripe_customer_id text, stripe_subscription_id text
);
create function public.ensure_profile_exists(_user_id uuid, _full_name text, _email text, _church_role text default null)
returns void language sql as $$
  insert into public.profiles (id, full_name, email, church_role) values (_user_id, _full_name, _email, _church_role)
  on conflict (id) do nothing;
$$;
create function public.get_user_account_id(_user_id uuid) returns uuid language sql stable as $$
  select account_id from public.account_members where user_id = _user_id order by created_at limit 1;
$$;
`;

export const createDatabase = async (): Promise<PGlite> => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  await db.exec(await Deno.readTextFile(MIGRATION_URL));
  await db.exec(`
    create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
  `);
  return db;
};
