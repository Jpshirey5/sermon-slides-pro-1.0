-- Service templates.
--
-- A template is a service saved for reuse: same order, same section names,
-- same blank slides and stage settings, but with no sermon or song picked.
-- Starting a new service from a template copies that structure; the church
-- then picks this week's sermon and songs.
--
-- Templates live in the services table (is_template = true) so they can be
-- opened and edited in the same workspace as any service.

alter table public.services
  add column if not exists is_template boolean not null default false;

create index if not exists idx_services_account_id_is_template
  on public.services (account_id, is_template);

-- Sermon and song sections may now be empty ("pick one"), which is what a
-- template's sections are. Ownership checks stay the same.
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

  if tg_op = 'INSERT' and new.item_type = 'video' and new.media_id is null then
    raise exception 'A video item needs a video' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Copy a service's structure into a new service or template. Sermon and song
-- sections come across empty; only their name and stage settings are kept.
-- Everything else (blank slides, readings, videos) is copied as is.
--
-- Runs as the caller, so row level security decides what they can read and
-- create: they can only copy services from their own church.
create or replace function public.copy_service_structure(
  _source_id uuid,
  _title text,
  _service_date date,
  _as_template boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  _source public.services%rowtype;
  _new_id uuid;
begin
  select * into _source from public.services where id = _source_id;
  if not found then
    raise exception 'Service not found' using errcode = '42501';
  end if;

  insert into public.services (account_id, campus_id, title, service_date, default_translation_id, logo_path, created_by_user_id, is_template)
  values (
    _source.account_id,
    _source.campus_id,
    coalesce(nullif(btrim(_title), ''), _source.title),
    case when _as_template then null else _service_date end,
    _source.default_translation_id,
    _source.logo_path,
    auth.uid(),
    _as_template
  )
  returning id into _new_id;

  insert into public.service_items (service_id, account_id, position, item_type, sermon_id, song_id, media_id, label, payload, payload_version)
  select
    _new_id,
    _source.account_id,
    i.position,
    i.item_type,
    null,
    null,
    i.media_id,
    i.label,
    case
      when i.item_type in ('sermon', 'song') then
        jsonb_strip_nulls(jsonb_build_object(
          'stage_template', i.payload -> 'stage_template',
          'timer_seconds', i.payload -> 'timer_seconds'
        ))
      else i.payload
    end,
    i.payload_version
  from public.service_items i
  where i.service_id = _source_id
  order by i.position;

  return _new_id;
end;
$$;

revoke all on function public.copy_service_structure(uuid, text, date, boolean) from public, anon;
grant execute on function public.copy_service_structure(uuid, text, date, boolean) to authenticated;
