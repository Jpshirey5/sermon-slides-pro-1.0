-- Song backgrounds, and song usage for CCLI reporting.
--
-- Backgrounds: each song can have its own background (a color, a picture, or
-- both), and the church can set a default used by every song that has none.
-- Pictures are storage refs to the presentation-backgrounds bucket, like
-- sermon slide backgrounds.
--
-- Usage: the presenter records a song once per service per day the first time
-- one of its slides is on the main screen. The CCLI Report page lists these so
-- the church can enter them in CCLI's reporting site. Rows hold the song's
-- title and numbers as they were that day (so the report survives a song being
-- edited or deleted). Never lyrics.

-- ── backgrounds ─────────────────────────────────────────────────────────────

alter table public.accounts
  add column if not exists song_background text
    check (song_background is null or song_background ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists song_background_image text
    check (song_background_image is null or char_length(song_background_image) <= 500);

alter table public.songs
  add column if not exists background text
    check (background is null or background ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists background_image text
    check (background_image is null or char_length(background_image) <= 500);

-- ── usage ───────────────────────────────────────────────────────────────────

create table if not exists public.song_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  used_on date not null,
  title text not null check (char_length(btrim(title)) > 0),
  author text,
  copyright text,
  ccli_song_number text check (ccli_song_number is null or ccli_song_number ~ '^[0-9]{1,12}$'),
  source text not null check (source in ('licensed', 'public_domain', 'original')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Once per song per service per day.
create unique index if not exists song_usage_once_per_service
  on public.song_usage (service_id, song_id, used_on);

create index if not exists idx_song_usage_account_id_used_on
  on public.song_usage (account_id, used_on desc);

alter table public.song_usage enable row level security;
revoke all on public.song_usage from anon, authenticated;
grant select, delete on public.song_usage to authenticated;

drop policy if exists "Members can view account song usage" on public.song_usage;
create policy "Members can view account song usage"
  on public.song_usage for select to authenticated
  using (public.is_account_member(auth.uid(), account_id));

-- A use recorded by mistake (a rehearsal on the real screen) can be removed.
drop policy if exists "Members can delete account song usage" on public.song_usage;
create policy "Members can delete account song usage"
  on public.song_usage for delete to authenticated
  using (public.is_account_member(auth.uid(), account_id));

-- Rows are only added through this function, which checks the service and the
-- song both belong to the caller's church and copies the song's details.
-- `_used_on` is the caller's local date; it must be within a day of today.
create or replace function public.record_song_use(_service_id uuid, _song_id uuid, _used_on date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _account uuid;
  _song public.songs%rowtype;
  _inserted int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if _used_on is null or abs(_used_on - current_date) > 1 then
    raise exception 'Use date must be today' using errcode = '22023';
  end if;

  select account_id into _account from public.services where id = _service_id and not is_template;
  if _account is null or not public.is_account_member(auth.uid(), _account) then
    raise exception 'Service not found' using errcode = '42501';
  end if;

  select * into _song from public.songs where id = _song_id and account_id = _account;
  if not found then
    raise exception 'Song not found' using errcode = '42501';
  end if;

  insert into public.song_usage (account_id, song_id, service_id, used_on, title, author, copyright, ccli_song_number, source, created_by_user_id)
  values (_account, _song.id, _service_id, _used_on, _song.title, _song.author, _song.copyright, _song.ccli_song_number, _song.source, auth.uid())
  on conflict (service_id, song_id, used_on) do nothing;
  get diagnostics _inserted = row_count;
  return _inserted > 0;
end;
$$;

revoke all on function public.record_song_use(uuid, uuid, date) from public, anon;
grant execute on function public.record_song_use(uuid, uuid, date) to authenticated;
