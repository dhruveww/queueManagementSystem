-- Baari — the minute heartbeat, driven from Postgres.
--
-- Run this ONCE in the Supabase SQL editor AFTER the app is deployed and you
-- know its public URL. It is not a migration: it depends on values that don't
-- exist until deploy time, and re-running `supabase db push` must not re-create
-- a job pointing at a stale URL.
--
-- WHY THIS EXISTS
-- vercel.json used to schedule /api/cron/tick at "* * * * *", but Vercel's
-- Hobby plan caps cron at once per day and rejects anything more frequent at
-- deploy time. That heartbeat is the only writer for grace-period nudges,
-- auto no-show, proactive "you're getting close" messages, analytics rollups
-- and the DPDP retention purge — so on the free plan the product would quietly
-- lose all of it. pg_cron ships on Supabase's free tier, so Postgres calls the
-- endpoint instead, every minute, at no cost.
--
-- Second benefit: a free Supabase project pauses after 7 days of inactivity and
-- then cold-starts for 10-30 seconds on the next request. A per-minute
-- heartbeat keeps it permanently warm, so a demo never opens on a spinner.

-- 1. Extensions. Both are available on the free plan; pg_net does the HTTP call.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Store the values in Vault rather than inlining them, so the bearer token
--    isn't sitting in cron.job.command in plaintext for anything that can read
--    that table.
--    REPLACE the two placeholder values below before running.
select vault.create_secret('https://YOUR-APP.vercel.app', 'baari_app_url',     'Baari public base URL');
select vault.create_secret('YOUR-CRON-SECRET-HERE',       'baari_cron_secret', 'Bearer token for /api/cron/tick');

-- 3. Schedule it. Unschedule first so this file is safe to re-run after a URL
--    change or a secret rotation.
select cron.unschedule('baari-tick') where exists (select 1 from cron.job where jobname = 'baari-tick');

select cron.schedule(
  'baari-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'baari_app_url')
           || '/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'baari_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- ---------------------------------------------------------------- verifying
--
-- The job is registered:
--   select jobid, jobname, schedule, active from cron.job;
--
-- It is actually firing (wait ~2 minutes first). `status` here is whether the
-- SQL ran, not whether the HTTP call succeeded:
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;
--
-- What the endpoint actually replied — this is the one that proves the whole
-- chain, and where a 401 shows up if the secret doesn't match Vercel's env var:
--   select id, status_code, content, created
--     from net._http_response order by created desc limit 5;
--
-- A healthy response body looks like:
--   {"ok":true,"grace":0,"skipped":0,"nudged":0,"rollups":2,"purged":0}
--
-- 401  -> baari_cron_secret does not match CRON_SECRET in Vercel
-- 500  -> CRON_SECRET is not set in Vercel at all (the route fails closed)
-- 404  -> baari_app_url is wrong
--
-- To change the URL or rotate the secret later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'baari_cron_secret'),
--     'new-secret-value'
--   );
--
-- To stop the heartbeat entirely:
--   select cron.unschedule('baari-tick');
