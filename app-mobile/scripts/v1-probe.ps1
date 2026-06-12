# Phase V.1 -- probe the reserve-first wrap on list-notifications.
#
# Five checks :
#  1) bogus bearer + new idem key  -> 401 (handler reaches requireUser).
#  2) bogus bearer + same idem key -> SAME 401 from cache (replay).
#  3) different idem key + same body -> independent 401.
#  4) same idem key + DIFFERENT body -> 409 IDEMPOTENCY_KEY_CONFLICT.
#  5) Two concurrent same-key POSTs (PS background jobs) -> exactly one
#     execution (401 from requireUser) + one REQUEST_IN_FLIGHT 409, OR
#     both 401 (one fresh + one replay). NO duplicate handler execution.

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
$envVars = @{}
foreach ($line in (Get-Content $envFile)) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') { $envVars[$matches[1]] = $matches[2] }
}
$base   = $envVars['EXPO_PUBLIC_SUPABASE_URL'] + '/functions/v1'
$apikey = $envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY']

function Probe {
  param([string]$Path, [string]$Body, [string]$IdemKey, [string]$Bearer = $null)
  $headers = @{
    'apikey'          = $apikey
    'authorization'   = if ($Bearer) { "Bearer $Bearer" } else { "Bearer $apikey" }
    'content-type'    = 'application/json'
    'idempotency-key' = if ($IdemKey) { $IdemKey } else { [Guid]::NewGuid().ToString() }
  }
  try {
    $r = Invoke-RestMethod -Method POST -Uri "$base$Path" -Headers $headers -Body $Body
    return @{ ok = $true; status = 200; body = ($r | ConvertTo-Json -Compress -Depth 5) }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $bodyText = $reader.ReadToEnd()
    $code = '?'
    try { $j = $bodyText | ConvertFrom-Json; if ($j.error.code) { $code = $j.error.code } } catch { }
    return @{ ok = $false; status = $status; code = $code; body = $bodyText }
  }
}

$idem1 = [Guid]::NewGuid().ToString()
$bogus = 'not-a-real-token'

Write-Host '=== 1) First call: 401 UNAUTHORIZED ==='
$r1 = Probe '/list-notifications' '{}' $idem1 $bogus
Write-Host ("   HTTP {0} code={1}" -f $r1.status, $r1.code)

Write-Host ''
Write-Host '=== 2) Same idem key + same body: REPLAY (also 401) ==='
$r2 = Probe '/list-notifications' '{}' $idem1 $bogus
Write-Host ("   HTTP {0} code={1}" -f $r2.status, $r2.code)
if ($r1.body -eq $r2.body) {
  Write-Host "   PASS: body identical (cached replay)" -ForegroundColor Green
} else {
  Write-Host "   WARN: bodies differ" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 3) Different idem key + same body: fresh exec ==='
$r3 = Probe '/list-notifications' '{}' ([Guid]::NewGuid().ToString()) $bogus
Write-Host ("   HTTP {0} code={1}" -f $r3.status, $r3.code)

Write-Host ''
Write-Host '=== 4) Same idem key + DIFFERENT body: 409 IDEMPOTENCY_KEY_CONFLICT ==='
$r4 = Probe '/list-notifications' '{"x":1}' $idem1 $bogus
Write-Host ("   HTTP {0} code={1}" -f $r4.status, $r4.code)
if ($r4.status -eq 409 -and $r4.code -eq 'IDEMPOTENCY_KEY_CONFLICT') {
  Write-Host "   PASS" -ForegroundColor Green
} else {
  Write-Host "   FAIL: expected 409 IDEMPOTENCY_KEY_CONFLICT" -ForegroundColor Red
}

Write-Host ''
Write-Host '=== 5) Two concurrent same-key POSTs ==='
$idem5 = [Guid]::NewGuid().ToString()
$baseUrl = "$base/list-notifications"
$scriptBlock = {
  param($url, $apikey, $bearer, $idem, $body)
  $headers = @{
    'apikey'          = $apikey
    'authorization'   = "Bearer $bearer"
    'content-type'    = 'application/json'
    'idempotency-key' = $idem
  }
  try {
    Invoke-RestMethod -Method POST -Uri $url -Headers $headers -Body $body | Out-Null
    return @{ ok = $true; status = 200; code = $null }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $bodyText = $reader.ReadToEnd()
    $code = '?'
    try { $j = $bodyText | ConvertFrom-Json; if ($j.error.code) { $code = $j.error.code } } catch { }
    return @{ ok = $false; status = $status; code = $code }
  }
}
$j1 = Start-Job -ScriptBlock $scriptBlock -ArgumentList $baseUrl, $apikey, $bogus, $idem5, '{}'
$j2 = Start-Job -ScriptBlock $scriptBlock -ArgumentList $baseUrl, $apikey, $bogus, $idem5, '{}'
Wait-Job $j1, $j2 | Out-Null
$out1 = Receive-Job $j1
$out2 = Receive-Job $j2
Remove-Job $j1, $j2
Write-Host ("   job1: HTTP {0} code={1}" -f $out1.status, $out1.code)
Write-Host ("   job2: HTTP {0} code={1}" -f $out2.status, $out2.code)
$codes = @($out1.code, $out2.code)
$got401 = ($codes -contains 'UNAUTHORIZED')
$gotIF  = ($codes -contains 'REQUEST_IN_FLIGHT')
$twoEqualUNAUTH = ($out1.code -eq 'UNAUTHORIZED' -and $out2.code -eq 'UNAUTHORIZED')
if ($got401 -and $gotIF) {
  Write-Host "   PASS: one execution + one REQUEST_IN_FLIGHT 409" -ForegroundColor Green
} elseif ($twoEqualUNAUTH) {
  Write-Host "   PASS: both 401 (one fresh + one replay)" -ForegroundColor Green
} else {
  Write-Host "   INSPECT: unexpected pattern" -ForegroundColor Yellow
}
