-- Phase I.1 — Enable pg_net + register the 5-second cron that kicks the
-- cron-poll-intents edge function. The actual polling logic lives in the
-- edge function (TypeScript, Phase I.3), not plpgsql. This migration only
-- wires the trigger pipe: pg_cron → kick_payment_intents_poll() →
-- net.http_post() → cron-poll-intents edge function.
--
-- Verified during Phase I.1 discovery:
--   * pg_cron 1.6.4 installed (already enabled)
--   * pg_net 0.20.3 available, not installed → enable here
--   * Sub-minute interval-string '5 seconds' supported (cron.schedule dry-run)
--   * app.settings.* cannot be ALTER DATABASE'd from migration (permission denied)
--     → Supabase URL hardcoded inline (V1 has one project)
--   * Anon key hardcoded — already publicly distributed via mobile app's
--     EXPO_PUBLIC_SUPABASE_ANON_KEY. Phase I' cleanup candidate: move to
--     Supabase Vault once key-rotation story exists.

create extension if not exists pg_net;

-- Kick function: POSTs to the cron-poll-intents edge function URL.
-- pg_net.http_post is async (returns request_id immediately) — we
-- fire-and-forget; the edge function does the actual polling work.
create or replace function public.kick_payment_intents_poll()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url        text := 'https://fvvqgcsphwrmdlclnxcz.supabase.co/functions/v1/cron-poll-intents';
  v_anon_key   text := 'sb_publishable_po_kl-ezVok6uIgkaq67gQ_AmX_SLPm';
  v_request_id bigint;
begin
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now())
  ) into v_request_id;
end;
$$;

-- Idempotency: unschedule any prior job with this name before re-scheduling.
-- Allows the migration to be re-run safely if it's ever replayed.
do $$
begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'payment-intents-poll';
exception when others then null;
end $$;

-- Schedule: every 5 seconds. Interval-string syntax verified in discovery.
-- Until the cron-poll-intents edge function exists (Phase I.3), this kick
-- function will POST to a URL that returns 404 — useful telemetry confirming
-- cron is alive. The 404s go away when I.3 deploys cron-poll-intents.
select cron.schedule(
  'payment-intents-poll',
  '5 seconds',
  'select public.kick_payment_intents_poll();'
);
