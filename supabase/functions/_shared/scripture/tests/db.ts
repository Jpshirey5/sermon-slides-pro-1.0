// Test database for the scripture and presenter tests: PGlite with minimal
// stubs of the Supabase objects the presenter migration depends on, then the
// real migration applied on top.

import { PGlite } from "npm:@electric-sql/pglite@0.5.8";

export const MIGRATION_URL = new URL(
  "../../../../migrations/20261008120000_add_presenter_services_and_scripture_cache.sql",
  import.meta.url,
);

// Mirrors the Supabase pieces the migration relies on. is_account_member and
// update_updated_at_column match the first app migration.
export const STUBS = `
create schema if not exists auth;
create role anon;
create role authenticated;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  can_use_esv boolean not null default false,
  subscription_status text not null default 'inactive',
  is_beta_user boolean not null default false,
  beta_trial_ends_at timestamptz,
  partner_billing_active boolean not null default false
);
create table public.account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  user_id uuid not null,
  role text not null default 'member'
);
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  name text not null
);
create table public.sermons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  title text not null,
  slides jsonb not null default '[]'::jsonb
);

create function public.update_updated_at_column() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create function public.is_account_member(_user_id uuid, _account_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_members where user_id = _user_id and account_id = _account_id)
$$;
`;

/** A fresh database. `beforeMigration` runs between the stubs and the migration. */
export const createTestDatabase = async (beforeMigration?: (db: PGlite) => Promise<void>): Promise<PGlite> => {
  const db = new PGlite();
  await db.exec(STUBS);
  if (beforeMigration) await beforeMigration(db);
  await db.exec(await Deno.readTextFile(MIGRATION_URL));
  return db;
};
