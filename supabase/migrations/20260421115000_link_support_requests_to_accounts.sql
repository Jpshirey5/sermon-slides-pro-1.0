alter table public.support_requests
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_support_requests_account_id_created_at
  on public.support_requests (account_id, created_at desc);
