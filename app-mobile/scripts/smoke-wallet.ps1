# Smoke test for the wallet/ledger edge functions. Creates a fresh user via phone OTP
# (dev_code stub), then exercises balance / topup-intent / withdraw-request / history,
# plus an unauthenticated 401 check. Run: & .\scripts\smoke-wallet.ps1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ref  = 'fvvqgcsphwrmdlclnxcz'
$root = Split-Path -Parent $PSScriptRoot
$anon = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*EXPO_PUBLIC_SUPABASE_ANON_KEY\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$base = "https://$ref.supabase.co/functions/v1"

function Call($path, $bodyObj, $bearer) {
  $h = @{ apikey = $anon; authorization = "Bearer $bearer"; 'content-type' = 'application/json'; 'idempotency-key' = [guid]::NewGuid().ToString() }
  $b = $bodyObj | ConvertTo-Json -Compress
  try {
    $r = Invoke-RestMethod -Method POST -Uri "$base$path" -Headers $h -Body $b -TimeoutSec 30
    return @{ ok = $true; data = $r }
  } catch {
    return @{ ok = $false; status = $_.Exception.Response.StatusCode.value__; body = $_.ErrorDetails.Message }
  }
}

$phone = '+2246' + (Get-Random -Minimum 10000000 -Maximum 99999999)
"target: $phone"

$req = Call '/otp-request' @{ channel = 'phone'; target = $phone; purpose = 'signin' } $anon
if (-not $req.ok) { "FAIL otp-request: $($req.status) $($req.body)"; return }
"1. otp-request ok: dev_code=$($req.data.dev_code)"

$ver = Call '/otp-verify' @{ otp_id = $req.data.otp_id; code = $req.data.dev_code } $anon
if (-not $ver.ok) { "FAIL otp-verify: $($ver.status) $($ver.body)"; return }
$access = $ver.data.access_token
"2. otp-verify ok: user=$($ver.data.user.id)"

$bal = Call '/wallet-balance' @{} $access
"3. wallet-balance: ok=$($bal.ok) -> $($bal.data | ConvertTo-Json -Compress)$($bal.body)"

$top = Call '/wallet-topup-intent' @{ currency = 'GNF'; amount_minor = 500000; method = 'orange_money' } $access
"4. wallet-topup-intent: ok=$($top.ok) -> $($top.data | ConvertTo-Json -Compress)$($top.body)"

$wd = Call '/wallet-withdraw-request' @{ currency = 'GNF'; amount_minor = 100 } $access
"5. wallet-withdraw-request (expect 400 INSUFFICIENT_FUNDS): ok=$($wd.ok) status=$($wd.status) $($wd.body)"

$hist = Call '/wallet-history' @{ limit = 10 } $access
"6. wallet-history: ok=$($hist.ok) -> $($hist.data | ConvertTo-Json -Compress)$($hist.body)"

$unauth = Call '/wallet-balance' @{} $anon
"7. wallet-balance unauth (expect 401): ok=$($unauth.ok) status=$($unauth.status) $($unauth.body)"