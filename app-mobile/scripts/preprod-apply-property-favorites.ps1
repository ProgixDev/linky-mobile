# Pre-prod: apply property_favorites table + toggle RPC via Management API.
# Mirrors preprod-apply-shop-followers / -addresses (db push remains unusable
# per project_migration_history_mismatch).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$migration = '20260621_01_property_favorites'
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
Write-Host '=== Verify property_favorites table + toggle RPC ==='
$check = RunQuery "select (select count(*) from information_schema.tables where table_schema='public' and table_name='property_favorites') as table_count, (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='toggle_property_favorite') as rpc_count, (select count(*) from pg_indexes where schemaname='public' and tablename='property_favorites') as index_count;"
$check | ConvertTo-Json -Depth 5 | Write-Host
