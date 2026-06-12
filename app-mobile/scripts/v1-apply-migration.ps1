# Phase V.1 — apply 20260611_05_idempotency_reserve.sql + verify schema.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migrationName = '20260611_05_idempotency_reserve'
$migrationPath = Join-Path $root "supabase\migrations\$migrationName.sql"
$sql = [System.IO.File]::ReadAllText($migrationPath, [System.Text.UTF8Encoding]::new($false))

$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }

function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3
  return Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}

Write-Host '=== APPLY 20260611_05_idempotency_reserve ==='
RunQuery $sql | Out-Null
Write-Host '  apply: OK'

Write-Host ''
Write-Host '=== Verify columns ==='
$cols = RunQuery @"
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='idempotency_keys'
 order by ordinal_position;
"@
$cols | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Verify CHECK ==='
$check = RunQuery @"
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid='public.idempotency_keys'::regclass
 order by conname;
"@
$check | ConvertTo-Json -Depth 5 | Write-Host
