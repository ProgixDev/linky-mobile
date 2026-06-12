# Phase V.1 -- garbage-bearer probe across the 5 money fns + list-notifications.
# Expect 401 UNAUTHORIZED + Linky envelope on every one (gateway didn't intercept).
$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
$envVars = @{}
foreach ($line in (Get-Content $envFile)) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') { $envVars[$matches[1]] = $matches[2] }
}
$base   = $envVars['EXPO_PUBLIC_SUPABASE_URL'] + '/functions/v1'
$apikey = $envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY']

function Probe {
  param([string]$Slug, [string]$Body)
  $headers = @{
    'apikey'          = $apikey
    'authorization'   = 'Bearer not-a-real-token'
    'content-type'    = 'application/json'
    'idempotency-key' = [Guid]::NewGuid().ToString()
  }
  try {
    Invoke-RestMethod -Method POST -Uri "$base/$Slug" -Headers $headers -Body $Body | Out-Null
    Write-Host ("  {0}: HTTP 200 (unexpected)" -f $Slug)
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $bodyText = $reader.ReadToEnd()
    $code = '?'
    try { $j = $bodyText | ConvertFrom-Json; if ($j.error.code) { $code = $j.error.code } } catch { }
    Write-Host ("  {0,-26} HTTP {1} code={2}" -f $Slug, $status, $code)
  }
}

Probe 'list-notifications'      '{}'
Probe 'place-order'             '{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1,"payment_method":"wallet"}'
Probe 'confirm-receipt'         '{"order_id":"00000000-0000-0000-0000-000000000000","scan_token":"deadbeefdeadbeefdeadbeefdeadbeef"}'
Probe 'wallet-withdraw-request' '{"currency":"GNF","amount_minor":1000}'
Probe 'cancel-pending-payment'  '{"order_id":"00000000-0000-0000-0000-000000000000"}'
Probe 'resolve-dispute'         '{"order_id":"00000000-0000-0000-0000-000000000000","outcome":"refund"}'
