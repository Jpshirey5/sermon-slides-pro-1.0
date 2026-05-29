-- Schedules the monthly-report Edge Function to run on the 1st of each month at
-- 13:00 UTC. Mirrors the HubSpot webhook approach: the function URL and worker
-- secret are read from Supabase Vault at runtime so no secret is committed here.
--
-- One-time setup BEFORE (or after) applying this migration (run in SQL editor/psql):
--   select vault.create_secret(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/monthly-report',
--     'monthly_report_url'
--   );
--   select vault.create_secret('<the same value as MONTHLY_REPORT_WORKER_SECRET>', 'monthly_report_worker_secret');
--
-- If pg_cron/pg_net are unavailable on the instance, schedule the function instead
-- from an external cron service (e.g. cron-job.org / GitHub Actions) with a monthly
-- POST to the function URL carrying the `x-worker-secret` header.

create extension if not exists pg_net with schema extensions;

-- Reads config from Vault and posts to the monthly-report function. Returns void so
-- it can be invoked directly by cron.schedule.
create or replace function public.trigger_monthly_report()
returns void
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
  where name = 'monthly_report_url';

  select decrypted_secret into _secret
  from vault.decrypted_secrets
  where name = 'monthly_report_worker_secret';

  if _url is null or _secret is null then
    raise warning 'monthly-report skipped: missing monthly_report_url or monthly_report_worker_secret in vault';
    return;
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', _secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

comment on function public.trigger_monthly_report()
  is 'Posts to the monthly-report Edge Function using URL + worker secret stored in Vault.';

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when insufficient_privilege or undefined_file or feature_not_supported then
      raise notice 'pg_cron unavailable; monthly report must be scheduled externally.';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'monthly-report-first-of-month'
    ) then
      perform cron.schedule(
        'monthly-report-first-of-month',
        '0 13 1 * *',
        $job$select public.trigger_monthly_report();$job$
      );
    end if;
  end if;
end;
$$;
