-- Song text style, and text position for service sections.
--
-- Songs: font, size, color, and position, saved on each song, with a church
-- default for songs that don't set their own. Every slide of a song uses the
-- same size so the words don't jump between slides.
--
-- Sections in a service can put their text in the upper third, the center, or
-- the lower third (service_items.payload.text_position). No column needed for
-- that, but templates should keep it, so copy_service_structure is updated.

alter table public.songs
  add column if not exists text_style jsonb not null default '{}'::jsonb
    check (jsonb_typeof(text_style) = 'object');

alter table public.accounts
  add column if not exists song_text_style jsonb not null default '{}'::jsonb
    check (jsonb_typeof(song_text_style) = 'object');

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
          'timer_seconds', i.payload -> 'timer_seconds',
          'text_position', i.payload -> 'text_position'
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
