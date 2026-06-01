# Phase I.3 mid-apply rotation: regen LINKY_CRON_SECRET because the prior
# value was exposed in a Read tool output. Generates a fresh CSPRNG secret,
# replaces the literal in migration 02, re-POSTs to Supabase secrets API.
# Never prints the secret value (length-only).

$ErrorActionPreference = 'Stop'

# Generate fresh CSPRNG 32-byte base64 secret.
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$cron = [Convert]::ToBase64String($bytes)
$secretLen = $cron.Length

# Update LINKY_CRON_SECRET via Management API.
$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$body = ConvertTo-Json @(@{ name = 'LINKY_CRON_SECRET'; value = $cron }) -Depth 3 -Compress
$null = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/secrets" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body `
  -ContentType 'application/json'

# Rewrite migration 02 with the new secret (same template, fresh value).
$template = @'
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
  v_cron_secret text := '__CRON_SECRET__';
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
'@
$content = $template -replace '__CRON_SECRET__', $cron
$migrationPath = Join-Path $root 'supabase\migrations\20260601_02_kick_function_secret.sql'
[System.IO.File]::WriteAllText($migrationPath, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host '=== ROTATION SUMMARY ==='
Write-Host "  new secret generated: yes (length: $secretLen)"
Write-Host '  env var updated:      LINKY_CRON_SECRET'
Write-Host "  migration 02 file:    rewritten"
Write-Host '  prior leaked value:   dead (not in env, not in DB - migration 02 not yet applied)'
