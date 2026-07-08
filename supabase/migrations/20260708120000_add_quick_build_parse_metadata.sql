-- Quick Build parser accuracy: record which prompt/model produced each parse so
-- accuracy metrics can be compared across prompt iterations and model A/Bs.
alter table public.quick_build_usage
  add column if not exists prompt_version text,
  add column if not exists model_id text;
