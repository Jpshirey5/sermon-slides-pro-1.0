-- Songs, and song items in services.
--
-- Lyrics rules (see CLAUDE.md): Sermon Slide Pro never ships or distributes
-- licensed lyrics. Churches enter lyrics they are licensed to use (under their
-- own CCLI license), public domain hymns, or original songs. Songs are private
-- to the church that entered them.
--
-- Per-item stage display settings (template, countdown) live in
-- service_items.payload, so they need no schema change.

-- The church's CCLI license number, shown in song credit lines.
alter table public.accounts
  add column if not exists ccli_license_number text
    check (ccli_license_number is null or ccli_license_number ~ '^[0-9]{1,12}$');

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  author text,
  ccli_song_number text check (ccli_song_number is null or ccli_song_number ~ '^[0-9]{1,12}$'),
  copyright text,
  source text not null default 'licensed' check (source in ('licensed', 'public_domain', 'original')),
  -- [{ id, label, lyrics }]. A blank line inside lyrics starts a new slide.
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  -- Section ids in singing order; a section may repeat. Empty means "as listed".
  arrangement jsonb not null default '[]'::jsonb check (jsonb_typeof(arrangement) = 'array'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_songs_account_id_title on public.songs (account_id, lower(title));

alter table public.songs enable row level security;
revoke all on public.songs from anon, authenticated;
grant select, insert, update, delete on public.songs to authenticated;

drop policy if exists "Members can view account songs" on public.songs;
create policy "Members can view account songs"
  on public.songs for select to authenticated
  using (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can create account songs" on public.songs;
create policy "Members can create account songs"
  on public.songs for insert to authenticated
  with check (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can update account songs" on public.songs;
create policy "Members can update account songs"
  on public.songs for update to authenticated
  using (public.is_account_member(auth.uid(), account_id))
  with check (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can delete account songs" on public.songs;
create policy "Members can delete account songs"
  on public.songs for delete to authenticated
  using (public.is_account_member(auth.uid(), account_id));

drop trigger if exists update_songs_updated_at on public.songs;
create trigger update_songs_updated_at
  before update on public.songs
  for each row execute function public.update_updated_at_column();

-- ── song items in services ──────────────────────────────────────────────────

alter table public.service_items
  add column if not exists song_id uuid references public.songs(id) on delete set null;

create index if not exists idx_service_items_song_id on public.service_items (song_id);

alter table public.service_items drop constraint if exists service_items_item_type_check;
alter table public.service_items
  add constraint service_items_item_type_check
    check (item_type in ('sermon', 'scripture', 'blank', 'logo', 'song'));

alter table public.service_items drop constraint if exists service_items_song_ref;
alter table public.service_items
  add constraint service_items_song_ref check (item_type = 'song' or song_id is null);

-- Same rules as before, plus: songs must belong to the service's church, and a
-- new song item needs a song.
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

  if new.song_id is not null and not exists (
    select 1 from public.songs where id = new.song_id and account_id = _service_account
  ) then
    raise exception 'Song does not belong to this account' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.item_type = 'sermon' and new.sermon_id is null then
    raise exception 'A sermon item needs a sermon' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.item_type = 'song' and new.song_id is null then
    raise exception 'A song item needs a song' using errcode = '23514';
  end if;

  return new;
end;
$$;
