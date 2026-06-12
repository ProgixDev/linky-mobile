# Phase V.1 -- controlled conflict + replay test.
#
# The wrap.ts on a 401-throwing handler always cancels the reservation, so the
# basic v1-probe can't observe CONFLICT or REPLAY against a real endpoint.
# This probe hand-INSERTs a completed row at a known fingerprint then proves :
#   - same-key + same body  -> 200 replay of the canned body (idempotent cache hit).
#   - same-key + diff body  -> 409 IDEMPOTENCY_KEY_CONFLICT.
#
# Uses Management API for the row INSERT/DELETE so we don't have to touch
# service-role from PowerShell. Cleans up after itself.

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
$envVars = @{}
foreach ($line in (Get-Content $envFile)) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') { $envVars[$matches[1]] = $matches[2] }
}
$base   = $envVars['EXPO_PUBLIC_SUPABASE_URL'] + '/functions/v1'
$apikey = $envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY']
$pat = (((Get-Content $envFile | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$queryHeaders = @{ Authorization = "Bearer $pat" }

function Sql($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3
  return Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $queryHeaders -Body $body -ContentType 'application/json'
}

function SHA256Hex($text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return -join ($hash | ForEach-Object { $_.ToString('x2') })
}

function CallFn {
  param([string]$Path, [string]$Body, [string]$IdemKey)
  $headers = @{
    'apikey'          = $apikey
    'authorization'   = "Bearer $apikey"
    'content-type'    = 'application/json'
    'idempotency-key' = $IdemKey
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

$route   = '/v1/notifications/list'
$reqBody = '{}'
$cachedBody = '{"hello":"replay-from-cache"}'
$cachedStatus = 200
$fingerprint = SHA256Hex("$route`n$reqBody")
$idem = "v1-probe-$([Guid]::NewGuid().ToString().Substring(0,8))"

Write-Host "fingerprint = $fingerprint"
Write-Host "idem        = $idem"

# Insert a fake completed row with our chosen fingerprint and a recognizable body.
$insertSql = @"
insert into public.idempotency_keys (key, fingerprint, status, status_code, response_body, expires_at)
values ('$idem', '$fingerprint', 'completed', $cachedStatus, '$cachedBody'::jsonb, now() + interval '1 hour')
on conflict (key) do update set
  fingerprint=excluded.fingerprint, status=excluded.status, status_code=excluded.status_code,
  response_body=excluded.response_body, expires_at=excluded.expires_at;
"@
Sql $insertSql | Out-Null
Write-Host "  inserted fake completed row"

try {
  Write-Host ''
  Write-Host '=== A) Same idem + same body -> 200 REPLAY of cached body ==='
  $rA = CallFn '/list-notifications' $reqBody $idem
  Write-Host ("   HTTP {0} body={1}" -f $rA.status, ($rA.body))
  if ($rA.status -eq $cachedStatus -and $rA.body -match 'replay-from-cache') {
    Write-Host "   PASS: cached body served verbatim" -ForegroundColor Green
  } else {
    Write-Host "   FAIL: did not return the canned cached body" -ForegroundColor Red
  }

  Write-Host ''
  Write-Host '=== B) Same idem + DIFFERENT body -> 409 IDEMPOTENCY_KEY_CONFLICT ==='
  $rB = CallFn '/list-notifications' '{"a":1}' $idem
  Write-Host ("   HTTP {0} code={1}" -f $rB.status, $rB.code)
  if ($rB.status -eq 409 -and $rB.code -eq 'IDEMPOTENCY_KEY_CONFLICT') {
    Write-Host "   PASS" -ForegroundColor Green
  } else {
    Write-Host "   FAIL: expected 409 IDEMPOTENCY_KEY_CONFLICT" -ForegroundColor Red
  }
} finally {
  Sql "delete from public.idempotency_keys where key='$idem';" | Out-Null
  Write-Host ''
  Write-Host '  cleanup: deleted probe row'
}
