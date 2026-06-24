# Phase LIVREUR ONBOARDING — apply the livreur_applications migration via the
# Supabase Management API. `supabase db push` is unusable on this project
# (remote/local migration-history mismatch); the Mgmt API query() endpoint is
# the only safe path. Idempotent: re-runnable (create-if-not-exists + CREATE OR
# REPLACE FUNCTION).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw "SUPABASE_ACCESS_TOKEN not found in .env" }
$ref = 'fvvqgcsphwrmdlclnxcz'
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }

function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3 -Compress
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}

function ApplyMigration($name) {
  $path = Join-Path $root "supabase\migrations\$name.sql"
  $sql = [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false))
  Write-Host "=== APPLY $name ==="
  RunQuery $sql | Out-Null
  Write-Host '  apply: OK'
}

ApplyMigration '20260623_01_livreur_applications'

Write-Host ''
Write-Host '=== Verify table + index + RLS ==='
RunQuery "select to_regclass('public.livreur_applications') as tbl, (select relrowsecurity from pg_class where oid='public.livreur_applications'::regclass) as rls, (select count(*) from pg_indexes where schemaname='public' and tablename='livreur_applications') as indexes;" | ConvertTo-Json -Depth 5

Write-Host ''
Write-Host '=== Verify decide_livreur_application RPC ==='
RunQuery "select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='decide_livreur_application';" | ConvertTo-Json -Depth 5
