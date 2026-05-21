-- Quick Build feature: adds creation-mode preference to profiles
alter table public.profiles
  add column if not exists user_sermon_creation_mode text
  check (user_sermon_creation_mode in ('structured_builder', 'quick_build'))
  default null;
