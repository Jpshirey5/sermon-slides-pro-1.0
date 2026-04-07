create or replace function public.cleanup_telemetry_events(
  retention_period interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.telemetry_events
  where created_at < now() - retention_period;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_telemetry_events(interval)
  is 'Deletes telemetry events older than the configured retention period. Default retention is 30 days.';

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when insufficient_privilege or undefined_file or feature_not_supported then
      raise notice 'pg_cron unavailable; telemetry cleanup function created without automatic scheduling.';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1
      from cron.job
      where jobname = 'cleanup-telemetry-events-daily'
    ) then
      perform cron.schedule(
        'cleanup-telemetry-events-daily',
        '15 4 * * *',
        $job$select public.cleanup_telemetry_events();$job$
      );
    end if;
  end if;
end;
$$;
