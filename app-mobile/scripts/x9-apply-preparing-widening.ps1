# Phase X.9 — apply 20260612_01_preparing_status_widening.sql via Supabase
# Management API. Pattern mirrors scripts/t1-apply-migration.ps1.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migrationName = '20260612_01_preparing_status_widening'
$migrationPath = Join-Path $root "supabase\migrations\$migrationName.sql"
$sql = [System.IO.File]::ReadAllText($migrationPath, [System.Text.UTF8Encoding]::new($false))

$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"

function Try-Apply($url, $body, $description) {
  try {
    $resp = Invoke-RestMethod -Uri $url -Method Post `
      -Headers @{ Authorization = "Bearer $pat" } `
      -Body $body -ContentType 'application/json'
    Write-Host "  ${description}: SUCCESS"
    return $true
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $detail = ''
    try { $detail = $_.ErrorDetails.Message } catch { }
    Write-Host "  ${description}: HTTP $code $detail"
    return $false
  }
}

Write-Host '=== APPLY MIGRATION 20260612_01_preparing_status_widening ==='

$queryBody = ConvertTo-Json @{ query = $sql } -Depth 3
$ok = Try-Apply $queryUrl $queryBody 'query endpoint'

if (-not $ok) { throw 'migration failed' }

# Verify : both RPCs now have 'preparing' in their accept list. Grep the body.
Write-Host ''
Write-Host '=== VERIFY ==='
$verifySql = @"
select 'confirm_order_receipt' as fn,
       (pg_get_functiondef('public.confirm_order_receipt(uuid,uuid)'::regprocedure) ilike '%preparing%') as has_preparing
union all
select 'dispute_order' as fn,
       (pg_get_functiondef('public.dispute_order(uuid,uuid,text,text)'::regprocedure) ilike '%preparing%') as has_preparing;
"@
$verifyBody = ConvertTo-Json @{ query = $verifySql } -Depth 3
$rows = Invoke-RestMethod -Uri $queryUrl -Method Post `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $verifyBody -ContentType 'application/json'
$rows | ConvertTo-Json -Depth 5 | Write-Host

# Both rows must report has_preparing = True.
$bad = @($rows | Where-Object { -not $_.has_preparing })
if ($bad.Count -gt 0) { throw 'verification failed — at least one RPC did not get the widened gate' }
Write-Host ''
Write-Host '=== DONE ==='
