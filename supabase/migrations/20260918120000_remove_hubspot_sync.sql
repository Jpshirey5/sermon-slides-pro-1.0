-- Removes the HubSpot contact/company sync entirely.
--
-- HubSpot is being repurposed for a separate business and must have no
-- connection to this app. The admin portal is the system of record for users,
-- billing, and usage.
--
-- Dropped here:
--   * hubspot_sync_on_profile_insert  on public.profiles
--   * hubspot_sync_on_invite_insert   on public.account_invites
--   * hubspot_sync_on_profile_delete  on public.profiles
--   * hubspot_sync_on_account_delete  on public.accounts
--   * public.sync_row_to_hubspot()
--
-- Originally added by 20260527230000_add_hubspot_sync_webhooks.sql and
-- 20260528120000_add_hubspot_delete_inactive_sync.sql. Those files were deleted
-- and their rows cleared from the remote schema_migrations ledger via
-- `supabase migration repair --status reverted`, so a fresh `db reset` never
-- creates these objects and the statements below are simply no-ops.
--
-- No data is dropped: the integration never persisted a HubSpot id or sync-state
-- column. Contact/company ids existed only in the Edge Function's HTTP response,
-- which pg_net discarded. Nothing else in the app reads these objects.
--
-- NOT dropped on purpose:
--   * extension pg_net  -- still used by public.trigger_monthly_report()
--   * the vault secrets 'hubspot_sync_url' / 'hubspot_sync_webhook_secret',
--     which are removed by hand (they live in Vault, not in schema).
--
-- Idempotent: every statement uses IF EXISTS.

drop trigger if exists hubspot_sync_on_profile_insert on public.profiles;
drop trigger if exists hubspot_sync_on_invite_insert on public.account_invites;
drop trigger if exists hubspot_sync_on_profile_delete on public.profiles;
drop trigger if exists hubspot_sync_on_account_delete on public.accounts;

drop function if exists public.sync_row_to_hubspot();
