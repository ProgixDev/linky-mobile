# Phase X.9b — apply confirm_order_receipt 3-arg overload fix to live DB.
# Mirrors the existing apply-migration scripts (db push is unusable per
# project_migration_history_mismatch).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$migration = '20260619_01_confirm_receipt_overload_fix'
$sql = [IO.File]::ReadAllText((Join-Path $root "supabase\migrations\$migration.sql"), [Text.UTF8Encoding]::new($false))
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }
function RunQuery($q) {
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body (ConvertTo-Json @{ query = $q } -Depth 3) -ContentType 'application/json'
}
Write-Host "=== APPLY $migration ==="
RunQuery $sql | Out-Null
Write-Host '  apply: OK'

Write-Host ''
Write-Host '=== Verify : only the 3-arg overload remains, body widens to include preparing ==='
$check = RunQuery "select pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) ~ 'preparing' as widens_preparing, pg_get_functiondef(p.oid) ~ 'INVALID_SCAN_TOKEN' as has_scan_token from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_order_receipt' order by args;"
$check | ConvertTo-Json -Depth 5 | Write-Host
