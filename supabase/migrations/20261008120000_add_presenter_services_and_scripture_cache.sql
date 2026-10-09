-- Presenter suite, Phase 1 data model.
--
-- Licensing rules this schema enforces (API.Bible, confirmed in writing):
--   * Stored verse text lives only in scripture_cache, server side, and expires
--     within 30 days of being fetched (check constraint below).
--   * Turning a translation off (suspended or revoked) deletes its cached text
--     immediately, and bumps a revocation epoch so presenters drop it. The
--     hourly housekeeping job is a backstop for the 72 hour removal promise.
--   * Clients never read cached text or FUMS records directly. Those tables
--     have RLS on and no policies; only edge functions (service role) use them.
--   * Services store scripture as references plus a translation id, never text.

-- ── translation catalog ─────────────────────────────────────────────────────

create table if not exists public.bible_translations (
  id text primary key,
  provider text not null check (provider in ('api_bible', 'esv_api')),
  -- API.Bible id. Null means we have no confirmed source yet, so the
  -- translation cannot be presented.
  provider_bible_id text,
  name text not null,
  language text not null,
  is_public_domain boolean not null default false,
  -- Copyright lines are filled from the provider (or by an admin), never
  -- guessed. A copyrighted translation with no copyright line cannot be
  -- presented; the edge functions fail closed on that.
  copyright_short text,
  copyright_full text,
  requires_entitlement boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'revoked')),
  status_changed_at timestamptz,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed from src/lib/translations.ts. Only KJV, ASV, and WEB are marked public
-- domain, and only they get a Bible id here (the ones scripture-lookup already
-- hardcodes). NIV, CSB, and NKJV ids live in edge function secrets today
-- (BIBLE_ID_*); the resolver falls back to those until this column is filled.
insert into public.bible_translations
  (id, provider, provider_bible_id, name, language, is_public_domain, copyright_short, copyright_full, requires_entitlement)
values
  ('KJV',     'api_bible', 'de4e12af7f28f599-02', 'King James Version',         'English',    true,  'Public domain', 'The King James Version is in the public domain in the United States.', false),
  ('ASV',     'api_bible', '06125adad2d5898a-01', 'American Standard Version',  'English',    true,  'Public domain', 'The American Standard Version is in the public domain.', false),
  ('WEB',     'api_bible', '9879dbb7cfe39e4d-04', 'World English Bible',        'English',    true,  'Public domain', 'The World English Bible is in the public domain.', false),
  ('NKJV',    'api_bible', null, 'New King James Version',      'English',    false, null, null, false),
  ('NIV',     'api_bible', null, 'New International Version',   'English',    false, null, null, false),
  ('CSB',     'api_bible', null, 'Christian Standard Bible',    'English',    false, null, null, false),
  ('AMP',     'api_bible', null, 'Amplified Bible',             'English',    false, null, null, false),
  ('RVR1960', 'api_bible', null, 'Reina-Valera 1960',           'Spanish',    false, null, null, false),
  ('NVI',     'api_bible', null, 'Nueva Versión Internacional', 'Spanish',    false, null, null, false),
  ('LSG',     'api_bible', null, 'Louis Segond',                'French',     false, null, null, false),
  ('LUT',     'api_bible', null, 'Luther Bible',                'German',     false, null, null, false),
  ('ALMEIDA', 'api_bible', null, 'Almeida Revisada',            'Portuguese', false, null, null, false),
  -- ESV comes from Crossway's API under its own license, not API.Bible.
  ('ESV',     'esv_api',   null, 'English Standard Version',    'English',    false, null, null, true)
on conflict (id) do nothing;

-- Per-account grants for translations that need an entitlement (ESV today).
create table if not exists public.account_translation_access (
  account_id uuid not null references public.accounts(id) on delete cascade,
  translation_id text not null references public.bible_translations(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (account_id, translation_id)
);

-- Carry over existing ESV grants.
insert into public.account_translation_access (account_id, translation_id)
select id, 'ESV' from public.accounts where can_use_esv = true
on conflict do nothing;

-- One row. Bumped whenever any translation or grant changes, so presenters
-- can cheaply ask "did anything get turned off since I loaded?"
create table if not exists public.scripture_revocation_state (
  id boolean primary key default true check (id),
  epoch bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.scripture_revocation_state (id) values (true) on conflict do nothing;

-- ── server-side verse cache ─────────────────────────────────────────────────

create table if not exists public.scripture_cache (
  translation_id text not null references public.bible_translations(id) on delete cascade,
  passage_id text not null,
  verses jsonb not null check (jsonb_typeof(verses) = 'array'),
  fums_token text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (translation_id, passage_id),
  constraint scripture_cache_max_30_days check (expires_at <= fetched_at + interval '30 days'),
  constraint scripture_cache_expires_after_fetch check (expires_at > fetched_at)
);

create index if not exists idx_scripture_cache_expires_at on public.scripture_cache (expires_at);

-- ── services ────────────────────────────────────────────────────────────────

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  title text not null check (char_length(btrim(title)) > 0),
  service_date date,
  default_translation_id text references public.bible_translations(id),
  logo_path text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_services_account_id_service_date_desc
  on public.services (account_id, service_date desc);

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  -- Copied from the parent service by trigger. Kept here so RLS is one lookup.
  account_id uuid not null references public.accounts(id) on delete cascade,
  position integer not null,
  -- New types (song, media, video) get added to this check later, each with
  -- its own nullable reference column. No table rewrite needed.
  item_type text not null check (item_type in ('sermon', 'scripture', 'blank', 'logo')),
  sermon_id uuid references public.sermons(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  payload_version smallint not null default 1,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_items_position_unique unique (service_id, position) deferrable initially deferred,
  -- A sermon item may outlive its sermon (sermon_id set null on delete); the
  -- presenter shows it as missing. Only sermon items may point at a sermon.
  constraint service_items_sermon_ref check (item_type = 'sermon' or sermon_id is null)
);

create index if not exists idx_service_items_service_id_position
  on public.service_items (service_id, position);
create index if not exists idx_service_items_sermon_id on public.service_items (sermon_id);

-- ── FUMS ledger ─────────────────────────────────────────────────────────────

create table if not exists public.fums_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid,
  device_id text not null,
  session_id text not null,
  translation_id text not null,
  fums_token text not null,
  displayed_at timestamptz not null,
  received_at timestamptz not null default now(),
  forwarded_at timestamptz,
  forward_attempts integer not null default 0,
  forward_error text
);

create index if not exists idx_fums_events_unforwarded
  on public.fums_events (received_at) where forwarded_at is null;

-- ── rate limiting ───────────────────────────────────────────────────────────

create table if not exists public.rate_counters (
  key text not null,
  bucket text not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (key, bucket)
);

-- ── RLS and grants ──────────────────────────────────────────────────────────

do $$
declare
  _table text;
begin
  foreach _table in array array[
    'bible_translations', 'account_translation_access', 'scripture_revocation_state',
    'scripture_cache', 'services', 'service_items', 'fums_events', 'rate_counters'
  ]
  loop
    execute format('alter table public.%I enable row level security', _table);
    execute format('revoke all on public.%I from anon, authenticated', _table);
  end loop;
end;
$$;

-- Catalog: signed-in users can read it (names, status, copyright lines).
grant select on public.bible_translations to authenticated;
drop policy if exists "Signed in users can view translations" on public.bible_translations;
create policy "Signed in users can view translations"
  on public.bible_translations for select to authenticated
  using (true);

grant select on public.account_translation_access to authenticated;
drop policy if exists "Members can view their translation access" on public.account_translation_access;
create policy "Members can view their translation access"
  on public.account_translation_access for select to authenticated
  using (public.is_account_member(auth.uid(), account_id));

-- Services and items: any member of the account, same as sermons.
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.service_items to authenticated;

drop policy if exists "Members can view account services" on public.services;
create policy "Members can view account services"
  on public.services for select to authenticated
  using (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can create account services" on public.services;
create policy "Members can create account services"
  on public.services for insert to authenticated
  with check (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can update account services" on public.services;
create policy "Members can update account services"
  on public.services for update to authenticated
  using (public.is_account_member(auth.uid(), account_id))
  with check (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can delete account services" on public.services;
create policy "Members can delete account services"
  on public.services for delete to authenticated
  using (public.is_account_member(auth.uid(), account_id));

drop policy if exists "Members can view service items" on public.service_items;
create policy "Members can view service items"
  on public.service_items for select to authenticated
  using (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can create service items" on public.service_items;
create policy "Members can create service items"
  on public.service_items for insert to authenticated
  with check (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can update service items" on public.service_items;
create policy "Members can update service items"
  on public.service_items for update to authenticated
  using (public.is_account_member(auth.uid(), account_id))
  with check (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can delete service items" on public.service_items;
create policy "Members can delete service items"
  on public.service_items for delete to authenticated
  using (public.is_account_member(auth.uid(), account_id));

-- scripture_revocation_state, scripture_cache, fums_events, rate_counters:
-- RLS on, no policies, no grants. Service role only.

-- ── triggers: services ──────────────────────────────────────────────────────

drop trigger if exists update_services_updated_at on public.services;
create trigger update_services_updated_at
  before update on public.services
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_service_items_updated_at on public.service_items;
create trigger update_service_items_updated_at
  before update on public.service_items
  for each row execute function public.update_updated_at_column();

-- A service's campus must belong to the same account.
create or replace function public.enforce_service_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.campus_id is not null and not exists (
    select 1 from public.campuses where id = new.campus_id and account_id = new.account_id
  ) then
    raise exception 'Campus does not belong to this account' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.account_id <> old.account_id then
    raise exception 'A service cannot move to another account' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_service_rules on public.services;
create trigger enforce_service_rules
  before insert or update on public.services
  for each row execute function public.enforce_service_rules();

-- Items always take account_id from their service (callers cannot spoof it),
-- and may only reference sermons from that same account.
create or replace function public.enforce_service_item_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _service_account uuid;
begin
  select account_id into _service_account from public.services where id = new.service_id;
  if _service_account is null then
    raise exception 'Service not found' using errcode = '23503';
  end if;
  new.account_id := _service_account;

  if new.sermon_id is not null and not exists (
    select 1 from public.sermons where id = new.sermon_id and account_id = _service_account
  ) then
    raise exception 'Sermon does not belong to this account' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.item_type = 'sermon' and new.sermon_id is null then
    raise exception 'A sermon item needs a sermon' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_service_item_rules on public.service_items;
create trigger enforce_service_item_rules
  before insert or update on public.service_items
  for each row execute function public.enforce_service_item_rules();

-- ── triggers and functions: revocation ──────────────────────────────────────

create or replace function public.bump_scripture_revocation_epoch()
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.scripture_revocation_state
  set epoch = epoch + 1, updated_at = now()
  where id
  returning epoch;
$$;

create or replace function public.purge_translation_cache(p_translation_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _deleted integer;
begin
  delete from public.scripture_cache where translation_id = p_translation_id;
  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;

create or replace function public.bible_translations_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists bible_translations_before_update on public.bible_translations;
create trigger bible_translations_before_update
  before update on public.bible_translations
  for each row execute function public.bible_translations_before_update();

-- Any status change bumps the epoch. Leaving 'active' deletes cached text now.
-- A changed copyright line or Bible id also bumps the epoch so presenters
-- reload the new attribution.
create or replace function public.bible_translations_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' and new.status is distinct from old.status then
    perform public.purge_translation_cache(new.id);
  end if;

  if new.status is distinct from old.status
     or new.copyright_short is distinct from old.copyright_short
     or new.provider_bible_id is distinct from old.provider_bible_id then
    perform public.bump_scripture_revocation_epoch();
  end if;

  return null;
end;
$$;

drop trigger if exists bible_translations_after_update on public.bible_translations;
create trigger bible_translations_after_update
  after update on public.bible_translations
  for each row execute function public.bible_translations_after_update();

create or replace function public.account_translation_access_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_scripture_revocation_epoch();
  return null;
end;
$$;

drop trigger if exists account_translation_access_changed on public.account_translation_access;
create trigger account_translation_access_changed
  after insert or update or delete on public.account_translation_access
  for each row execute function public.account_translation_access_changed();

-- Keep accounts.can_use_esv working as the switch admins already use.
create or replace function public.sync_account_esv_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.can_use_esv is distinct from old.can_use_esv then
    if new.can_use_esv then
      insert into public.account_translation_access (account_id, translation_id)
      values (new.id, 'ESV')
      on conflict (account_id, translation_id)
      do update set revoked_at = null, granted_at = now();
    else
      update public.account_translation_access
      set revoked_at = now()
      where account_id = new.id and translation_id = 'ESV' and revoked_at is null;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_account_esv_access on public.accounts;
create trigger sync_account_esv_access
  after update of can_use_esv on public.accounts
  for each row execute function public.sync_account_esv_access();

-- ── reordering ──────────────────────────────────────────────────────────────

-- Reorder a service's items in one transaction (the position unique
-- constraint is deferred, so swaps never collide). Runs as the caller, so RLS
-- still decides what they may touch. The list must name every item exactly once.
create or replace function public.reorder_service_items(p_service_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  _count integer;
begin
  select count(*) into _count from public.service_items where service_id = p_service_id;
  if _count <> coalesce(array_length(p_item_ids, 1), 0)
     or _count <> (select count(distinct x) from unnest(p_item_ids) as x) then
    raise exception 'Item list does not match the service' using errcode = '22023';
  end if;

  update public.service_items si
  set position = ord.n * 1000
  from unnest(p_item_ids) with ordinality as ord(id, n)
  where si.id = ord.id and si.service_id = p_service_id;

  get diagnostics _count = row_count;
  if _count <> array_length(p_item_ids, 1) then
    raise exception 'Item list does not match the service' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.reorder_service_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_service_items(uuid, uuid[]) to authenticated;

-- ── rate limiting ───────────────────────────────────────────────────────────

-- Fixed-window counter. The caller picks the bucket (for example
-- 'bundle:2026-10-08T14:05'). Returns true while within the limit.
create or replace function public.rate_take(p_key text, p_bucket text, p_limit int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.rate_counters as c (key, bucket, count)
  values (p_key, p_bucket, 1)
  on conflict (key, bucket) do update set count = c.count + 1
  returning c.count <= p_limit;
$$;

-- ── housekeeping ────────────────────────────────────────────────────────────

create or replace function public.presenter_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scripture_cache where expires_at <= now();
  delete from public.scripture_cache c
    using public.bible_translations t
    where t.id = c.translation_id and t.status <> 'active';
  delete from public.fums_events where received_at < now() - interval '90 days';
  delete from public.rate_counters where created_at < now() - interval '2 days';
end;
$$;

do $$
declare
  _fn text;
begin
  foreach _fn in array array[
    'public.bump_scripture_revocation_epoch()',
    'public.purge_translation_cache(text)',
    'public.rate_take(text, text, int)',
    'public.presenter_housekeeping()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', _fn);
  end loop;
end;
$$;

-- Hourly, so expired text is gone within an hour of expiring.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when insufficient_privilege or undefined_file or feature_not_supported then
      raise notice 'pg_cron unavailable; presenter_housekeeping created without automatic scheduling.';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'presenter-housekeeping-hourly') then
      perform cron.schedule(
        'presenter-housekeeping-hourly',
        '17 * * * *',
        $job$select public.presenter_housekeeping();$job$
      );
    end if;
  end if;
end;
$$;
