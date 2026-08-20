-- Surfaces failures from finalize-account-deletions (e.g. a Stripe subscription
-- cancel/customer delete that errors) in the admin notifications feed instead of
-- only being visible in function logs / account_deletion_requests.last_error.
alter table public.admin_notifications
  drop constraint if exists admin_notifications_type_check;

alter table public.admin_notifications
  add constraint admin_notifications_type_check
  check (type in (
    'support_request',
    'account_deletion_requested',
    'account_saving_needed',
    'subscription_changed',
    'payment_issue',
    'account_deletion_finalization_failed'
  ));
