# Smoke tests for mock-lengopay edge function.
# Convention: smoke scripts live alongside their edge function as .ps1
# (set during Phase I.2). Run from app-mobile/ as:
#   powershell -File supabase\functions\mock-lengopay\smoke.ps1
# Idempotent — each run creates its own state rows; no cleanup needed
# between runs. Reset all mock state via:
#   DELETE FROM public.mock_lengopay_state;

$ErrorActionPreference = 'Stop'

# --- Setup ---------------------------------------------------------------
$apikey = (Get-Content .env |
  Select-String 'EXPO_PUBLIC_SUPABASE_ANON_KEY=' |
  ForEach-Object { $_.Line.Split('=',2)[1].Trim() })
if (-not $apikey) { throw 'EXPO_PUBLIC_SUPABASE_ANON_KEY not found in .env' }

$base = 'https://fvvqgcsphwrmdlclnxcz.supabase.co/functions/v1/mock-lengopay'
$h = @{
  'apikey' = $apikey
  'Authorization' = "Bearer $apikey"
  'Content-Type' = 'application/json'
}

# Pass/fail tracker. Each smoke pushes a [bool, string] tuple.
$results = @()
function Record-Result($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ name = $name; ok = $ok; detail = $detail }
}

function Read-ErrorBody($e) {
  $stream = $e.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $reader.ReadToEnd()
}

# --- Smoke A: POST /init-payment (default phone) -------------------------
Write-Host '=== Smoke A: POST /init-payment (default phone) ==='
$initBody = '{"amount":"4944000","currency":"GNF","website_id":"smoke-test","account_type":"lp-om-gn","account_number":"+224622551288"}'
$a = Invoke-RestMethod -Uri "$base/init-payment" -Method Post -Headers $h -Body $initBody
Write-Host "  pay_id=$($a.pay_id) status=$($a.status) message='$($a.message)'"
$okA = ($a.status -eq 'pending') -and ($a.pay_id -match '^[0-9a-f-]{36}$')
Record-Result 'A init default phone' $okA "status=$($a.status) pay_id_valid=$($a.pay_id -match '^[0-9a-f-]{36}$')"
$payIdA = $a.pay_id

# --- Smoke B: GET /status/<pay_id> immediately (expect pending) ----------
Write-Host ''
Write-Host '=== Smoke B: GET /status/<pay_id> immediately ==='
$b = Invoke-RestMethod -Uri "$base/status/$payIdA" -Method Get -Headers $h
Write-Host "  status=$($b.status) message='$($b.message)'"
$okB = $b.status -eq 'pending'
Record-Result 'B status immediately' $okB "status=$($b.status)"

# --- Smoke C: wait 11s, expect status=success ----------------------------
Write-Host ''
Write-Host '=== Smoke C: wait 11s, GET /status/<pay_id> (expect success) ==='
Start-Sleep -Seconds 11
$c = Invoke-RestMethod -Uri "$base/status/$payIdA" -Method Get -Headers $h
Write-Host "  status=$($c.status) message='$($c.message)'"
$okC = $c.status -eq 'success'
Record-Result 'C status after 11s' $okC "status=$($c.status)"

# --- Smoke D: magic +224999999990, wait 6s, expect failed/INSUFFICIENT --
Write-Host ''
Write-Host '=== Smoke D: magic +224999999990, wait 6s, expect failed ==='
$failBody = '{"amount":"4944000","currency":"GNF","website_id":"smoke-test","account_type":"lp-om-gn","account_number":"+224999999990"}'
$d1 = Invoke-RestMethod -Uri "$base/init-payment" -Method Post -Headers $h -Body $failBody
Write-Host "  init: pay_id=$($d1.pay_id) status=$($d1.status)"
Start-Sleep -Seconds 6
$d2 = Invoke-RestMethod -Uri "$base/status/$($d1.pay_id)" -Method Get -Headers $h
Write-Host "  status=$($d2.status) error_code=$($d2.error_code) message='$($d2.message)'"
$okD = ($d2.status -eq 'failed') -and ($d2.error_code -eq 'INSUFFICIENT_BALANCE')
Record-Result 'D magic insufficient' $okD "status=$($d2.status) error_code=$($d2.error_code)"

# --- Smoke E: bogus uuid, expect 404 NOT_FOUND ---------------------------
Write-Host ''
Write-Host '=== Smoke E: GET /status/<bogus-uuid> (expect 404 NOT_FOUND) ==='
$bogusStatus = $null
$bogusCode = $null
try {
  Invoke-WebRequest -Uri "$base/status/00000000-0000-0000-0000-000000000000" -Method Get -Headers $h | Out-Null
} catch {
  $bogusStatus = $_.Exception.Response.StatusCode.value__
  $bodyText = Read-ErrorBody $_
  Write-Host "  STATUS: $bogusStatus"
  Write-Host "  BODY:   $bodyText"
  try { $bogusCode = ($bodyText | ConvertFrom-Json).error.code } catch { }
}
$okE = ($bogusStatus -eq 404) -and ($bogusCode -eq 'NOT_FOUND')
Record-Result 'E bogus 404' $okE "status=$bogusStatus code=$bogusCode"

# --- Summary -------------------------------------------------------------
Write-Host ''
Write-Host '=== SUMMARY ==='
$passCount = ($results | Where-Object { $_.ok }).Count
$failCount = ($results | Where-Object { -not $_.ok }).Count
foreach ($r in $results) {
  $tag = if ($r.ok) { 'PASS' } else { 'FAIL' }
  Write-Host "  [$tag] $($r.name) - $($r.detail)"
}
Write-Host "  TOTAL: $passCount pass / $failCount fail"
if ($failCount -gt 0) { exit 1 }
