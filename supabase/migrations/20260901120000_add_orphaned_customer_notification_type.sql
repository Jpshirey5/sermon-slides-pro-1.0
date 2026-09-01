-- Surfaces the previously-silent "Stripe checkout completed but no matching
-- account or paid-signup session was found" case (stripe-webhook) in the admin
-- notifications feed instead of only being visible in function logs.
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
    'account_deletion_finalization_failed',
    'orphaned_stripe_customer'
  ));
