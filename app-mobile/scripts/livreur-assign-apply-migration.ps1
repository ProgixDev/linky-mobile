# Phase LIVREUR ASSIGNMENT — apply the admin_assign_delivery RPC via the
# Supabase Management API (db push is unusable on this project). Idempotent.
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
$name = '20260623_02_admin_assign_delivery'
$sql = [IO.File]::ReadAllText((Join-Path $root "supabase\migrations\$name.sql"), [Text.UTF8Encoding]::new($false))
Write-Host "=== APPLY $name ==="
RunQuery $sql | Out-Null
Write-Host '  apply: OK'
Write-Host '=== Verify admin_assign_delivery RPC ==='
RunQuery "select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_assign_delivery';" | ConvertTo-Json -Depth 5
