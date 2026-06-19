# Pre-prod: apply shop_followers schema + toggle RPC via Management API.
# Mirrors the existing apply-migration scripts (db push is unusable per
# project_migration_history_mismatch).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$migration = '20260619_02_shop_followers'
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
Write-Host '=== Verify shop_followers table + toggle RPC exist ==='
$check = RunQuery "select (select count(*) from information_schema.tables where table_schema='public' and table_name='shop_followers') as table_count, (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='toggle_shop_follower') as rpc_count;"
$check | ConvertTo-Json -Depth 5 | Write-Host
