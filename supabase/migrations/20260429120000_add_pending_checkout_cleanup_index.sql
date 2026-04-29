create index if not exists idx_accounts_pending_checkout_cleanup
  on public.accounts (signup_status, created_at)
  where signup_status = 'pending_checkout';
