# Apply migration 02 via Supabase Management API without flowing the SQL
# (which contains the secret literal) through any MCP tool args. The file is
# read from disk inside the script's process; HTTP request body goes directly
# to Supabase. Conversation transcript only sees this script body + a redacted
# status line on completion.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migrationName = '20260601_02_kick_function_secret'
$migrationPath = Join-Path $root "supabase\migrations\$migrationName.sql"
$sql = [System.IO.File]::ReadAllText($migrationPath, [System.Text.UTF8Encoding]::new($false))

# Try the migrations endpoint first; fall back to ad-hoc query endpoint if 404.
$migrationsUrl = "https://api.supabase.com/v1/projects/$ref/database/migrations"
$queryUrl      = "https://api.supabase.com/v1/projects/$ref/database/query"

function Try-Apply($url, $body, $description) {
  try {
    $resp = Invoke-RestMethod -Uri $url -Method Post `
      -Headers @{ Authorization = "Bearer $pat" } `
      -Body $body -ContentType 'application/json'
    Write-Host "  ${description}: SUCCESS"
    return $true
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "  ${description}: HTTP $code"
    return $false
  }
}

Write-Host '=== APPLY MIGRATION 02 ==='

$migrationsBody = ConvertTo-Json @{ name = $migrationName; query = $sql } -Depth 3
$ok = Try-Apply $migrationsUrl $migrationsBody 'migrations endpoint'

if (-not $ok) {
  $queryBody = ConvertTo-Json @{ query = $sql } -Depth 3
  $ok = Try-Apply $queryUrl $queryBody 'query endpoint (fallback)'
}

if ($ok) {
  Write-Host "  migration:    $migrationName"
  Write-Host '  secret value: NOT echoed (length-only confirmation in verify step)'
  Write-Host '  status:       applied'
} else {
  throw 'Both endpoints failed; aborting.'
}
