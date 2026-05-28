-- Extend the hubspot-sync wiring to also propagate DELETES as "inactive" flags.
--
-- We never hard-delete in HubSpot (that would lose marketing/sales history).
-- Instead, when a contact (profiles row) or org (accounts row) is deleted in the
-- app, the Edge Function PATCHes a custom status property to "inactive".
--
-- Two changes here:
--   1) Teach the shared trigger fn to forward the correct payload for any TG_OP
--      (it previously hardcoded the INSERT shape: record = NEW, old_record = null).
--   2) Add AFTER DELETE triggers on public.profiles (-> HubSpot Contact) and
--      public.accounts (-> HubSpot Company).
--
-- Idempotent: the function is CREATE OR REPLACE and triggers are dropped first.

create or replace function public.sync_row_to_hubspot()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  _url text;
  _secret text;
begin
  select decrypted_secret into _url
  from vault.decrypted_secrets
  where name = 'hubspot_sync_url';

  select decrypted_secret into _secret
  from vault.decrypted_secrets
  where name = 'hubspot_sync_webhook_secret';

  -- Without config, skip silently so application writes never fail.
  if _url is null or _secret is null then
    raise warning 'hubspot-sync skipped: missing hubspot_sync_url or hubspot_sync_webhook_secret in vault';
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    -- Match the Supabase Database Webhook payload shape: NEW on insert/update,
    -- OLD on delete. The function reads `record` for INSERT and `old_record` for DELETE.
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

-- New: a contact deleted in the app -> flag the HubSpot Contact inactive.
-- (Fires on cascade from auth.users deletion too, since profiles.id FKs auth.users.)
drop trigger if exists hubspot_sync_on_profile_delete on public.profiles;
create trigger hubspot_sync_on_profile_delete
  after delete on public.profiles
  for each row
  execute function public.sync_row_to_hubspot();

-- New: an org deleted in the app -> flag the HubSpot Company inactive.
drop trigger if exists hubspot_sync_on_account_delete on public.accounts;
create trigger hubspot_sync_on_account_delete
  after delete on public.accounts
  for each row
  execute function public.sync_row_to_hubspot();
