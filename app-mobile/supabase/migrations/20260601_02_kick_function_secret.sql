-- Phase I.3 S3: add x-cron-secret header to the cron->edge-function pipe.
-- The cron-poll-intents edge function checks this header and 401s otherwise.
-- Without this, anyone with the public anon key could POST to the cron endpoint
-- and trigger polling cycles (DoS / Lengopay quota burn).
--
-- Secret value hardcoded per S3 sub-decision (a). Mirrors anon-key hardcode
-- pattern. Rotation = update both this migration AND LINKY_CRON_SECRET env
-- var, then re-apply this migration + redeploy cron-poll-intents.
-- See [[project-payments]] "Phase I' secrets-to-Vault cleanup" for the
-- post-V1 Vault-based pattern and the pre-git-push rotation gate.

create or replace function public.kick_payment_intents_poll()
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_url         text := 'https://fvvqgcsphwrmdlclnxcz.supabase.co/functions/v1/cron-poll-intents';
  v_anon_key    text := 'sb_publishable_po_kl-ezVok6uIgkaq67gQ_AmX_SLPm';
  v_cron_secret text := 'cUFPeOzIPb+V6gQA3GpWHLY4e+oVIkv6cmMtesOoerc=';
  v_request_id  bigint;
begin
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-cron-secret', v_cron_secret
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now())
  ) into v_request_id;
end;
$func$;