alter table public.support_requests
  add column if not exists status text not null default 'active',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_admin_id uuid references public.admin_users(id) on delete set null,
  add column if not exists archived_until timestamptz;

alter table public.support_requests
  drop constraint if exists support_requests_status_check;

alter table public.support_requests
  add constraint support_requests_status_check
  check (status in ('active', 'archived'));

create index if not exists idx_support_requests_status_created_at
  on public.support_requests (status, created_at desc);

create index if not exists idx_support_requests_archived_until
  on public.support_requests (archived_until)
  where status = 'archived';
