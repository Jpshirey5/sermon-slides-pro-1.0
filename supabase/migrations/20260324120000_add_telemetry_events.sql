create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event', 'error')),
  name text not null,
  route text,
  properties jsonb not null default '{}'::jsonb,
  error_message text,
  error_stack text,
  user_id uuid,
  account_id uuid,
  anonymous_id text not null,
  session_id text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.telemetry_events enable row level security;

create index if not exists telemetry_events_created_at_idx
  on public.telemetry_events (created_at desc);

create index if not exists telemetry_events_kind_name_idx
  on public.telemetry_events (kind, name);

create index if not exists telemetry_events_user_id_idx
  on public.telemetry_events (user_id);

revoke all on public.telemetry_events from anon, authenticated;
