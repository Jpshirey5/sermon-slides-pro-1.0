-- Records how each presentation was created: Quick Build (manuscript upload) vs the
-- Structured Builder form. Nullable so existing decks read as "unknown"; new decks are
-- attributed from deploy forward. Values mirror profiles.user_sermon_creation_mode.
alter table public.sermons
  add column if not exists creation_mode text
  check (creation_mode in ('structured_builder', 'quick_build'))
  default null;

-- Speeds up the build-mode split aggregation in the admin usage report.
create index if not exists sermons_creation_mode_idx
  on public.sermons (creation_mode);
