-- Quick Build feature: per-upload usage log for tier enforcement and audit
create table if not exists public.quick_build_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  sermon_id uuid references public.sermons(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  file_name text not null,
  file_size_bytes integer not null,
  tokens_used integer,
  parsing_duration_ms integer,
  status text not null check (status in ('success', 'failed', 'partial')),
  error_message text,
  translation text,
  points_detected integer,
  verses_detected integer
);

alter table public.quick_build_usage enable row level security;

drop policy if exists "Users can read their own quick build usage" on public.quick_build_usage;
create policy "Users can read their own quick build usage"
  on public.quick_build_usage
  for select
  to authenticated
  using (user_id = auth.uid());

-- service-role inserts only; no INSERT/UPDATE/DELETE policies for authenticated users

create index if not exists idx_quick_build_usage_user_month
  on public.quick_build_usage (user_id, uploaded_at desc);
