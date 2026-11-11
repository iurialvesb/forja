-- Apple Watch → HealthFit → Intervals.icu → Forja: se comprueba cada 2 minutos (antes 10) y se procesa en el servidor.
select cron.unschedule('forja-intervals') where exists (select 1 from cron.job where jobname = 'forja-intervals');
select cron.schedule('forja-intervals', '*/2 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/intervals-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"pull"}'::jsonb,
    timeout_milliseconds := 60000)
$$);
