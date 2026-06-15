# Phase Y.1 — apply 20260615_01_response_time_default_ascii.sql + verify.
# Pattern mirrors scripts/x9-apply-preparing-widening.ps1.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migrationName = '20260615_01_response_time_default_ascii'
$migrationPath = Join-Path $root "supabase\migrations\$migrationName.sql"
# Critical: read the file as UTF-8 without BOM. The whole reason this migration
# exists is that the prior em-dash default got CP1252-mangled on the wire.
$sql = [System.IO.File]::ReadAllText($migrationPath, [System.Text.UTF8Encoding]::new($false))

$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }

function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3
  return Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}

Write-Host "=== APPLY $migrationName ==="
RunQuery $sql | Out-Null
Write-Host '  apply: OK'

Write-Host ''
Write-Host '=== Verify column default is now empty string ==='
$col = RunQuery @"
select column_name, column_default
  from information_schema.columns
 where table_schema='public' and table_name='shops'
   and column_name='response_time_text';
"@
$col | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Verify every row is now clean (bytes <= 50 and ASCII) ==='
$rows = RunQuery @"
select id, response_time_text,
       octet_length(response_time_text) as bytes,
       (response_time_text ~ '^[\x20-\x7E]*$') as ascii_only
  from public.shops
 order by created_at;
"@
$rows | ConvertTo-Json -Depth 5 | Write-Host

$bad = @($rows | Where-Object { -not $_.ascii_only })
if ($bad.Count -gt 0) { throw "Y.1 verification failed: $($bad.Count) row(s) still non-ASCII" }

Write-Host ''
Write-Host '=== DONE — Y.1 schema/data fix applied ==='
