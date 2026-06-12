# Phase V.7 - apply confirm_topup fix + verify.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$migration = '20260611_08_confirm_topup_qualify'
$sql = [IO.File]::ReadAllText((Join-Path $root "supabase\migrations\$migration.sql"), [Text.UTF8Encoding]::new($false))
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }
function RunQuery($q) {
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body (ConvertTo-Json @{ query = $q } -Depth 3) -ContentType 'application/json'
}
Write-Host '=== APPLY 20260611_08_confirm_topup_qualify ==='
RunQuery $sql | Out-Null
Write-Host '  apply: OK'

Write-Host ''
Write-Host '=== Verify body has le.wallet_id (qualified) ==='
$check = RunQuery "select pg_get_functiondef(p.oid) ~ 'le\.wallet_id = v_wallet_id' as is_qualified, pg_get_functiondef(p.oid) ~ ' wallet_id = v_wallet_id' as has_unqualified_match from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_topup';"
$check | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Controlled-raise probe : nonexistent topup id -> TOPUP_NOT_FOUND ==='
try {
  RunQuery "select public.confirm_topup('00000000-0000-0000-0000-000000000000'::uuid);"
} catch {
  $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.BaseStream.Position=0; $reader.DiscardBufferedData()
  Write-Host "  body: $($reader.ReadToEnd())"
}
