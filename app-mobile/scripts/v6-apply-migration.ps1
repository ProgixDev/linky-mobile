# Phase V.6 - apply pick_stale_stripe_intents migration + verify.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$migration = '20260611_07_stale_stripe_sweep'
$sql = [IO.File]::ReadAllText((Join-Path $root "supabase\migrations\$migration.sql"), [Text.UTF8Encoding]::new($false))
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }
function RunQuery($q) {
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body (ConvertTo-Json @{ query = $q } -Depth 3) -ContentType 'application/json'
}
Write-Host '=== APPLY 20260611_07_stale_stripe_sweep ==='
RunQuery $sql | Out-Null
Write-Host '  apply: OK'

Write-Host ''
Write-Host '=== Verify function exists ==='
$check = RunQuery "select proname, pg_get_function_arguments(oid) as args from pg_proc where proname='pick_stale_stripe_intents';"
$check | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Call with empty database (no stale rows) -- expect 0 rows ==='
$callRes = RunQuery "select count(*) as n from public.pick_stale_stripe_intents(50);"
$callRes | ConvertTo-Json -Depth 5 | Write-Host
