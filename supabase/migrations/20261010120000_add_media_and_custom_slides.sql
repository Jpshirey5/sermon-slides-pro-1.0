-- Media (videos) and two new service item types:
--   slides  free-form slides built in the workspace (welcome, announcements, graphics)
--   video   one video, played on the main screen with sound
--
-- Videos are the church's own files, stored privately per church. Images
-- (backgrounds, graphics) keep using the existing presentation-backgrounds
-- bucket.

-- ── storage ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-media',
  'service-media',
  false,
  -- 1 GB per file. The project's global upload limit (Supabase dashboard,
  -- Storage settings) must also allow files this large.
  1073741824,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

drop policy if exists "Members can view service media" on storage.objects;
create policy "Members can view service media"
on storage.objects for select to authenticated
using (
  bucket_id = 'service-media'
  and (storage.foldername(name))[1] = 'account'
  and public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

drop policy if exists "Members can upload service media" on storage.objects;
create policy "Members can upload service media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-media'
  and (storage.foldername(name))[1] = 'account'
  and public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

drop policy if exists "Members can delete service media" on storage.objects;
create policy "Members can delete service media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'service-media'
  and (storage.foldername(name))[1] = 'account'
  and public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

-- ── media library ───────────────────────────────────────────────────────────

create table if not exists public.service_media (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('video')),
  storage_path text not null unique
    check (storage_path ~ '^account/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  file_name text not null check (char_length(btrim(file_name)) > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  width integer,
  height integer,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_media_account_id_created_at on public.service_media (account_id, created_at desc);

alter table public.service_media enable row level security;
revoke all on public.service_media from anon, authenticated;
grant select, insert, update, delete on public.service_media to authenticated;

drop policy if exists "Members can view account media" on public.service_media;
create policy "Members can view account media"
  on public.service_media for select to authenticated
  using (public.is_account_member(auth.uid(), account_id));
drop policy if exists "Members can add account media" on public.service_media;
create policy "Members can add account media"
  on public.service_media for insert to authenticated
  with check (
    public.is_account_member(auth.uid(), account_id)
    -- The file must live in this church's own folder.
    and storage_path like 'account/' || account_id::text || '/%'
  );
drop policy if exists "Members can update account media" on public.service_media;
create policy "Members can update account media"
  on public.service_media for update to authenticated
  using (public.is_account_member(auth.uid(), account_id))
  with check (public.is_account_member(auth.uid(), account_id) and storage_path like 'account/' || account_id::text || '/%');
drop policy if exists "Members can delete account media" on public.service_media;
create policy "Members can delete account media"
  on public.service_media for delete to authenticated
  using (public.is_account_member(auth.uid(), account_id));

-- ── new item types ──────────────────────────────────────────────────────────

alter table public.service_items
  add column if not exists media_id uuid references public.service_media(id) on delete set null;

create index if not exists idx_service_items_media_id on public.service_items (media_id);

alter table public.service_items drop constraint if exists service_items_item_type_check;
alter table public.service_items
  add constraint service_items_item_type_check
    check (item_type in ('sermon', 'scripture', 'blank', 'logo', 'song', 'slides', 'video'));

alter table public.service_items drop constraint if exists service_items_media_ref;
alter table public.service_items
  add constraint service_items_media_ref check (item_type = 'video' or media_id is null);

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

  if new.media_id is not null and not exists (
    select 1 from public.service_media where id = new.media_id and account_id = _service_account
  ) then
    raise exception 'Media does not belong to this account' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.item_type = 'sermon' and new.sermon_id is null then
    raise exception 'A sermon item needs a sermon' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.item_type = 'song' and new.song_id is null then
    raise exception 'A song item needs a song' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.item_type = 'video' and new.media_id is null then
    raise exception 'A video item needs a video' using errcode = '23514';
  end if;

  return new;
end;
$$;
