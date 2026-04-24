alter table public.admin_notifications
  add column if not exists external_event_id text;

drop index if exists idx_admin_notifications_external_event_id;
create unique index if not exists idx_admin_notifications_external_event_id
  on public.admin_notifications (external_event_id)
  where external_event_id is not null;

alter table public.admin_notifications
  drop constraint if exists admin_notifications_type_check;

alter table public.admin_notifications
  add constraint admin_notifications_type_check
  check (type in (
    'support_request',
    'account_deletion_requested',
    'account_saving_needed',
    'subscription_changed',
    'payment_issue'
  ));
