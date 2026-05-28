-- Database Webhooks that push new users and new team invites to HubSpot via
-- the hubspot-sync Edge Function.
--
-- Rather than hardcoding the function URL and webhook secret into the trigger
-- definition (which would commit a secret to source control), a shared trigger
-- function reads both from Supabase Vault at runtime and posts via pg_net.
--
-- One-time setup BEFORE applying this migration (run in the SQL editor or psql):
--   select vault.create_secret(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/hubspot-sync',
--     'hubspot_sync_url'
--   );
--   select vault.create_secret('<the same value as HUBSPOT_SYNC_WEBHOOK_SECRET>', 'hubspot_sync_webhook_secret');

-- Required for outbound HTTP from Postgres triggers.
create extension if not exists pg_net with schema extensions;

-- Shared trigger function: resolves config from Vault and forwards the row to the
-- Edge Function. The function branches on the table name carried in the payload.
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

  -- Without config, skip silently so application writes (signup/invite) never fail.
  if _url is null or _secret is null then
    raise warning 'hubspot-sync skipped: missing hubspot_sync_url or hubspot_sync_webhook_secret in vault';
    return new;
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    -- Match the Supabase Database Webhook payload shape the function expects.
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', null
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

-- 1) New signups: a row lands in public.profiles when a user completes signup.
drop trigger if exists hubspot_sync_on_profile_insert on public.profiles;
create trigger hubspot_sync_on_profile_insert
  after insert on public.profiles
  for each row
  execute function public.sync_row_to_hubspot();

-- 2) Invited team members: a row lands in public.account_invites when an owner invites someone.
drop trigger if exists hubspot_sync_on_invite_insert on public.account_invites;
create trigger hubspot_sync_on_invite_insert
  after insert on public.account_invites
  for each row
  execute function public.sync_row_to_hubspot();
