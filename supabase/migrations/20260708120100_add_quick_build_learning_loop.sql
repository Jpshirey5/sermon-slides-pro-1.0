-- Quick Build learning loop: persist each parse's extracted structure, link it to
-- the sermon the user eventually saves, store the original-vs-final diff, and keep
-- a capped per-user format profile that is injected into future parses.
-- Privacy: only the extracted structure and the model's format analysis are stored —
-- never the manuscript text, HTML, or PDF contents.

create table if not exists public.quick_build_parses (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid references public.quick_build_usage(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  created_at timestamptz not null default now(),
  prompt_version text,
  model_id text,
  document_analysis jsonb,
  parsed_structure jsonb not null,
  sermon_id uuid references public.sermons(id) on delete set null,
  final_structure jsonb,
  structure_diff jsonb,
  finalized_at timestamptz
);

alter table public.quick_build_parses enable row level security;

drop policy if exists "Users can read their own quick build parses" on public.quick_build_parses;
create policy "Users can read their own quick build parses"
  on public.quick_build_parses
  for select
  to authenticated
  using (user_id = auth.uid());

-- service-role writes only; no INSERT/UPDATE/DELETE policies for authenticated users

create index if not exists idx_quick_build_parses_user
  on public.quick_build_parses (user_id, created_at desc);
create index if not exists idx_quick_build_parses_prompt
  on public.quick_build_parses (prompt_version, finalized_at);

create table if not exists public.quick_build_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null,
  profile_text text,
  candidate_hints jsonb,
  parse_count integer not null default 0,
  meaningful_correction_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.quick_build_user_profiles enable row level security;

drop policy if exists "Users can read their own quick build profile" on public.quick_build_user_profiles;
create policy "Users can read their own quick build profile"
  on public.quick_build_user_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

-- service-role writes only; no INSERT/UPDATE/DELETE policies for authenticated users
