# Phase LIVREUR — apply the two livreur migrations via Supabase Management API.
# Mgmt API is the only safe path: `supabase db push` is broken on this project
# (remote/local migration history mismatch). Each migration is sent as a single
# query() POST.
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

ApplyMigration '20260622_01_livreur_role'
ApplyMigration '20260622_02_deliveries'

Write-Host ''
Write-Host '=== Verify users.roles CHECK includes livreur ==='
$check1 = RunQuery "select pg_get_constraintdef(c.oid) as defn from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname='users' and c.conname='users_roles_subset_check';"
$check1 | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Verify deliveries table + trigger ==='
$check2 = RunQuery "select (select count(*) from public.deliveries) as deliveries_count, (select count(*) from public.orders) as orders_count, (select tgname from pg_trigger where tgname='trg_create_delivery_for_new_order') as trigger_name;"
$check2 | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Verify the two new RPCs exist ==='
$check3 = RunQuery "select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('assign_delivery','livreur_confirm_handoff') order by 1;"
$check3 | ConvertTo-Json -Depth 5 | Write-Host
