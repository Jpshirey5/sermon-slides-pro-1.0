alter table public.admin_notification_reads
  add column if not exists cleared_at timestamptz;

create index if not exists idx_admin_notification_reads_admin_cleared
  on public.admin_notification_reads (admin_user_id, cleared_at)
  where cleared_at is not null;
