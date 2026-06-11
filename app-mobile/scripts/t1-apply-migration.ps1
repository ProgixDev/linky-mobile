# Phase T.1 — apply 20260611_03_user_roles.sql via Supabase Management API.
# Pattern mirrors scripts/i3-apply-migration-02.ps1.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migrationName = '20260611_03_user_roles'
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

Write-Host '=== APPLY MIGRATION 20260611_03_user_roles ==='

# Note: pgsql_migration_history mismatch — apply via /query, not the migrations endpoint.
# See memory/project_migration_history_mismatch.md.
$queryBody = ConvertTo-Json @{ query = $sql } -Depth 3
$ok = Try-Apply $queryUrl $queryBody 'query endpoint'

if (-not $ok) { throw 'migration failed' }

# Verify : the new columns exist and the CHECK is wired.
Write-Host ''
Write-Host '=== VERIFY ==='
$verifySql = @"
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'users'
   and column_name in ('roles','city')
 order by column_name;
"@
$verifyBody = ConvertTo-Json @{ query = $verifySql } -Depth 3
$rows = Invoke-RestMethod -Uri $queryUrl -Method Post `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $verifyBody -ContentType 'application/json'
$rows | ConvertTo-Json -Depth 5 | Write-Host

$constraintSql = @"
select conname from pg_constraint
 where conrelid = 'public.users'::regclass
   and conname in ('users_roles_nonempty_check','users_roles_subset_check','users_city_len_check')
 order by conname;
"@
$cBody = ConvertTo-Json @{ query = $constraintSql } -Depth 3
$cs = Invoke-RestMethod -Uri $queryUrl -Method Post `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $cBody -ContentType 'application/json'
$cs | ConvertTo-Json -Depth 5 | Write-Host
