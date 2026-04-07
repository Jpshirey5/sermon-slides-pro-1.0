-- Targets dashboard sermon listing:
-- WHERE account_id = ? ORDER BY updated_at DESC LIMIT/OFFSET pagination
create index if not exists idx_sermons_account_id_updated_at_desc
  on public.sermons (account_id, updated_at desc);

-- Targets active account invite listing:
-- WHERE account_id = ? AND expires_at > now() ORDER BY created_at DESC
create index if not exists idx_account_invites_account_id_created_at_desc
  on public.account_invites (account_id, created_at desc);
