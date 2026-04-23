create table if not exists public.email_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  current_email text not null,
  requested_email text not null,
  token_hash text not null unique,
  requested_by_admin_id uuid references public.admin_users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'canceled')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_email_change_requests_pending_user
  on public.email_change_requests (user_id)
  where status = 'pending';

create unique index if not exists idx_email_change_requests_requested_email_pending
  on public.email_change_requests (lower(requested_email))
  where status = 'pending';

create index if not exists idx_email_change_requests_account_created
  on public.email_change_requests (account_id, created_at desc);

alter table public.email_change_requests enable row level security;

drop policy if exists "Admins can view email change requests" on public.email_change_requests;
create policy "Admins can view email change requests"
on public.email_change_requests
for select
to authenticated
using (public.is_admin(auth.uid()));

drop trigger if exists touch_email_change_requests_updated_at on public.email_change_requests;
create trigger touch_email_change_requests_updated_at
before update on public.email_change_requests
for each row execute function public.touch_admin_updated_at();
