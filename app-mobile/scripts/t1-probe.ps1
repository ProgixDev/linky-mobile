# Phase T.1 — probe newly deployed fns return the Linky envelope (not the
# gateway's verify_jwt 401 — that would indicate config drift). We probe with
# a deliberately bogus bearer ; the response should be Linky UNAUTHORIZED.

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
$envVars = @{}
foreach ($line in (Get-Content $envFile)) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') {
    $envVars[$matches[1]] = $matches[2]
  }
}
$base   = $envVars['EXPO_PUBLIC_SUPABASE_URL'] + '/functions/v1'
$apikey = $envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY']
if (-not $base -or -not $apikey) { throw 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env' }

function Probe {
  param([string]$Slug, [string]$Body, [bool]$Authed)
  $h = @{
    'apikey'          = $apikey
    'idempotency-key' = [Guid]::NewGuid().ToString()
    'content-type'    = 'application/json'
  }
  $h['authorization'] = if ($Authed) { 'Bearer not-a-real-token' } else { "Bearer $apikey" }
  try {
    $r = Invoke-RestMethod -Method POST -Uri "$base/$Slug" -Headers $h -Body $Body
    Write-Host "  ${Slug}: HTTP 200 (unexpected) $($r | ConvertTo-Json -Compress)"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $raw    = $_.ErrorDetails.Message
    $code = '?'
    try {
      $j = $raw | ConvertFrom-Json
      if ($j.error.code) { $code = $j.error.code } elseif ($j.code) { $code = $j.code }
    } catch { }
    Write-Host "  ${Slug}: HTTP $status code=$code"
  }
}

Write-Host '=== T.1 probes ==='

# update-profile : auth required, expect UNAUTHORIZED (not gateway 401).
Probe 'update-profile' '{"display_name":"x"}' $true

# update-profile : empty body should fail validation BEFORE auth check ?
# No — auth check is the first server call after validate. So with bogus
# bearer, even a well-formed body returns UNAUTHORIZED. Confirms requireUser
# is wired and the Linky envelope is in place.
Probe 'update-profile' '{}' $true

# product-create / property-create : auth required.
Probe 'product-create' '{"title":"x","price_minor":1000,"category":"electronique","condition":"neuf","photos":["https://x.invalid/a.jpg"],"city":"Conakry"}' $true
Probe 'property-create' '{"type":"vente","title":"x","price_minor":1000,"amenities":[],"city":"Conakry","distance_to_road_m":0,"photos":[{"url":"https://x.invalid/a.jpg","storage_path":"a","position":0}]}' $true

# email-signup : returns roles + city. Use a fresh email, idempotency-key is per-request.
$probeEmail = "t1-probe-$([Guid]::NewGuid().ToString().Substring(0,8))@linky.test"
$h2 = @{
  'apikey'          = $apikey
  'authorization'   = "Bearer $apikey"
  'content-type'    = 'application/json'
  'idempotency-key' = [Guid]::NewGuid().ToString()
}
try {
  $r = Invoke-RestMethod -Method POST -Uri "$base/email-signup" -Headers $h2 -Body "{`"email`":`"$probeEmail`",`"password`":`"hunter22-test`"}"
  $u = $r.user
  Write-Host "  email-signup: HTTP 200 user.id=$($u.id) roles=$($u.roles -join ',') city=$($u.city) kyc=$($u.kyc_status)"
  if (-not ($u.roles -is [array]) -or $u.roles.Count -lt 1) {
    Write-Host "  FAIL: email-signup user.roles missing or empty" -ForegroundColor Red
  } else {
    Write-Host "  PASS: email-signup carries roles=[$($u.roles -join ',')]" -ForegroundColor Green
  }
} catch {
  Write-Host "  email-signup probe failed: $($_.Exception.Message)" -ForegroundColor Red
}
