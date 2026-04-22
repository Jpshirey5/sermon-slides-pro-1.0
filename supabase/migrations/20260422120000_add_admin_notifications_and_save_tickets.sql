create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'support_request',
    'account_deletion_requested',
    'account_saving_needed',
    'subscription_changed'
  )),
  title text not null,
  message text not null,
  account_id uuid references public.accounts(id) on delete set null,
  support_request_id uuid references public.support_requests(id) on delete set null,
  account_deletion_request_id uuid references public.account_deletion_requests(id) on delete set null,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_notifications_created_at
  on public.admin_notifications (created_at desc);

create index if not exists idx_admin_notifications_type_created_at
  on public.admin_notifications (type, created_at desc);

create index if not exists idx_admin_notifications_account_id_created_at
  on public.admin_notifications (account_id, created_at desc);

create table if not exists public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, admin_user_id)
);

create index if not exists idx_admin_notification_reads_admin_user_id
  on public.admin_notification_reads (admin_user_id, read_at desc);

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;

drop policy if exists "Admins can view admin notifications" on public.admin_notifications;
create policy "Admins can view admin notifications"
on public.admin_notifications
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can view own notification reads" on public.admin_notification_reads;
create policy "Admins can view own notification reads"
on public.admin_notification_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.id = admin_notification_reads.admin_user_id
      and au.user_id = auth.uid()
      and au.status = 'active'
  )
);

alter table public.account_deletion_requests
  add column if not exists save_ticket_id uuid references public.support_requests(id) on delete set null,
  add column if not exists save_ticket_created_at timestamptz;

create index if not exists idx_account_deletion_requests_save_ticket
  on public.account_deletion_requests (status, cancelable_until, save_ticket_created_at)
  where save_ticket_id is null;
