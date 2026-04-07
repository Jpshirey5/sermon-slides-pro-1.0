alter table public.sermons
  add column if not exists series text,
  add column if not exists presentation_date date;

update public.sermons
set series = nullif(trim(slides -> 'formData' ->> 'series'), '')
where series is null
  and jsonb_typeof(slides) = 'object'
  and jsonb_typeof(slides -> 'formData') = 'object'
  and nullif(trim(slides -> 'formData' ->> 'series'), '') is not null;

update public.sermons
set presentation_date = case
  when jsonb_typeof(slides) = 'object'
    and jsonb_typeof(slides -> 'formData') = 'object'
    and nullif(trim(slides -> 'formData' ->> 'date'), '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (slides -> 'formData' ->> 'date')::date
  else created_at::date
end
where presentation_date is null;

create index if not exists sermons_account_presentation_date_idx
  on public.sermons (account_id, presentation_date desc, updated_at desc);
