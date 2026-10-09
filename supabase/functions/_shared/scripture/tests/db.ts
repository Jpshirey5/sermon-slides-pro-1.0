// Test database for the scripture and presenter tests: PGlite with minimal
// stubs of the Supabase objects the presenter migration depends on, then the
// real migration applied on top.

import { PGlite } from "npm:@electric-sql/pglite@0.5.8";

export const MIGRATION_URLS = [
  "20261008120000_add_presenter_services_and_scripture_cache.sql",
  "20261009120000_add_songs_and_stage_settings.sql",
  "20261010120000_add_media_and_custom_slides.sql",
].map((name) => new URL(`../../../../migrations/${name}`, import.meta.url));

// Mirrors the Supabase pieces the migration relies on. is_account_member and
// update_updated_at_column match the first app migration.
export const STUBS = `
create schema if not exists auth;
create role anon;
create role authenticated;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

create schema if not exists storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
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
  for (const url of MIGRATION_URLS) await db.exec(await Deno.readTextFile(url));
  return db;
};
