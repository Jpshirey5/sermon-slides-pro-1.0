alter table public.support_requests
  add column if not exists email_contacted_at timestamptz,
  add column if not exists email_contacted_by_admin_id uuid references public.admin_users(id) on delete set null;

create index if not exists idx_support_requests_email_contacted_at
  on public.support_requests (email_contacted_at)
  where email_contacted_at is not null;
