# Phase I.4 cancel-pending-payment smoke. 4 scenarios:
#   (a) POST {}                            -> 400 INVALID_BODY (no auth needed; body check first)
#   (b) POST {order_id: 'not-a-uuid'}      -> 400 INVALID_BODY
#   (c) POST valid-uuid-but-wrong-buyer    -> 403 FORBIDDEN (with real JWT)
#   (d) POST valid-buyer's-placed-order    -> 200 + {ok:true} + DB verifies cancel
#
# Auth: mints a fresh JWT via OTP request+verify (dev_code echoed in stub mode).
# Setup: directly INSERTs 2 synth orders + 2 intents (one for wrong-buyer, one
# for the auth user). Idempotent re-runs use fresh GUIDs.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ref = 'fvvqgcsphwrmdlclnxcz'
$supaUrl = "https://$ref.supabase.co"
$fnBase = "$supaUrl/functions/v1"

$apikey = (Get-Content (Join-Path $root '.env') | Select-String 'EXPO_PUBLIC_SUPABASE_ANON_KEY=' | ForEach-Object { $_.Line.Split('=',2)[1].Trim() })
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')

function Invoke-Sql($sql) {
  $body = ConvertTo-Json @{ query = $sql } -Depth 20 -Compress
  return Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
    -Method Post -Headers @{ Authorization = "Bearer $pat" } -Body $body -ContentType 'application/json'
}

function Invoke-Fn($slug, $body, $jwt = $null, $idemKey = $null) {
  $h = @{
    'apikey' = $apikey
    'Authorization' = if ($jwt) { "Bearer $jwt" } else { "Bearer $apikey" }
    'Content-Type' = 'application/json'
    'Idempotency-Key' = if ($idemKey) { $idemKey } else { [guid]::NewGuid().ToString() }
  }
  return Invoke-RestMethod -Uri "$fnBase/$slug" -Method Post -Headers $h -Body $body
}

$results = @()
function Record($name, $ok, $detail) { $script:results += [pscustomobject]@{ name=$name; ok=$ok; detail=$detail } }

# --- Setup: mint JWT for phone user via OTP flow -------------------------
Write-Host '=== Setup: mint JWT for +224622551288 via OTP ==='
$otpReqBody = ConvertTo-Json @{ channel='phone'; target='+224622551288'; purpose='signin' } -Compress
$otpReq = Invoke-Fn 'otp-request' $otpReqBody
if (-not $otpReq.dev_code) { throw 'otp-request did not return dev_code (not in stub mode?)' }
Write-Host "  otp_id=$($otpReq.otp_id) dev_code_length=$($otpReq.dev_code.Length)"

$otpVerBody = ConvertTo-Json @{ otp_id=$otpReq.otp_id; code=$otpReq.dev_code } -Compress
$otpVer = Invoke-Fn 'otp-verify' $otpVerBody
$jwt = $otpVer.access_token
$authUserId = $otpVer.user.id
Write-Host "  authed as user_id=$authUserId jwt_length=$($jwt.Length)"

# --- Setup: clone FK template, insert 2 synth orders + intents ----------
$refOrder = (Invoke-Sql "SELECT seller_id::text AS seller_id, shop_id::text AS shop_id, product_id::text AS product_id FROM public.orders ORDER BY created_at DESC LIMIT 1;")[0]

# Synth order #1: buyer = email user (wrong buyer for the auth user's JWT)
$wrongBuyer = '019e7114-64b1-771c-9352-20176d2f04b7'
$refWrong = "SMK-CPP-WRONG-$([guid]::NewGuid().ToString().Substring(0,8))"
$null = Invoke-Sql @"
INSERT INTO public.orders
  (reference, buyer_id, seller_id, shop_id, product_id, product_snapshot,
   quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events)
VALUES
  ('$refWrong', '$wrongBuyer'::uuid, '$($refOrder.seller_id)'::uuid,
   '$($refOrder.shop_id)'::uuid, '$($refOrder.product_id)'::uuid,
   '{"title":"SMOKE-CPP","photo":"","priceGnf":4800000}'::jsonb,
   1, 4800000, 144000, 4944000, 'orange-money', 'GNF', 'placed',
   jsonb_build_array(jsonb_build_object('at', now(), 'label', 'Commande passée')));
"@
$wrongOrderId = (Invoke-Sql "SELECT id::text FROM public.orders WHERE reference='$refWrong';")[0].id
$null = Invoke-Sql "INSERT INTO public.payment_intents (order_id, rail, rail_intent_id, method, currency, amount_minor, payer_phone) VALUES ('$wrongOrderId'::uuid, 'lengopay', 'smoke-cpp-wrong-$([guid]::NewGuid())', 'orange-money', 'GNF', 4944000, '+224999000001');"

# Synth order #2: buyer = auth user (correct, should succeed)
$refMine = "SMK-CPP-MINE-$([guid]::NewGuid().ToString().Substring(0,8))"
$null = Invoke-Sql @"
INSERT INTO public.orders
  (reference, buyer_id, seller_id, shop_id, product_id, product_snapshot,
   quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events)
VALUES
  ('$refMine', '$authUserId'::uuid, '$($refOrder.seller_id)'::uuid,
   '$($refOrder.shop_id)'::uuid, '$($refOrder.product_id)'::uuid,
   '{"title":"SMOKE-CPP","photo":"","priceGnf":4800000}'::jsonb,
   1, 4800000, 144000, 4944000, 'orange-money', 'GNF', 'placed',
   jsonb_build_array(jsonb_build_object('at', now(), 'label', 'Commande passée')));
"@
$mineOrderId = (Invoke-Sql "SELECT id::text FROM public.orders WHERE reference='$refMine';")[0].id
$null = Invoke-Sql "INSERT INTO public.payment_intents (order_id, rail, rail_intent_id, method, currency, amount_minor, payer_phone) VALUES ('$mineOrderId'::uuid, 'lengopay', 'smoke-cpp-mine-$([guid]::NewGuid())', 'orange-money', 'GNF', 4944000, '+224622551288');"

Write-Host "  synth orders: wrong=$refWrong mine=$refMine"

# --- Smoke A: empty body -> 400 INVALID_BODY ----------------------------
Write-Host ''
Write-Host '=== (a) POST {} -> expect 400 INVALID_BODY ==='
$okA = $false; $detailA = ''
try { Invoke-Fn 'cancel-pending-payment' '{}' | Out-Null }
catch {
  $code = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream(); $rdr = New-Object System.IO.StreamReader($stream); $body = $rdr.ReadToEnd()
  try { $err = ($body | ConvertFrom-Json).error.code } catch { $err = 'parse-err' }
  $okA = ($code -eq 400) -and ($err -eq 'INVALID_BODY')
  $detailA = "status=$code code=$err"
}
Write-Host "  $detailA"
Record '(a) empty body' $okA $detailA

# --- Smoke B: bad uuid -> 400 INVALID_BODY ------------------------------
Write-Host ''
Write-Host "=== (b) POST {order_id:'not-a-uuid'} -> expect 400 INVALID_BODY ==="
$okB = $false; $detailB = ''
try { Invoke-Fn 'cancel-pending-payment' '{"order_id":"not-a-uuid"}' | Out-Null }
catch {
  $code = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream(); $rdr = New-Object System.IO.StreamReader($stream); $body = $rdr.ReadToEnd()
  try { $err = ($body | ConvertFrom-Json).error.code } catch { $err = 'parse-err' }
  $okB = ($code -eq 400) -and ($err -eq 'INVALID_BODY')
  $detailB = "status=$code code=$err"
}
Write-Host "  $detailB"
Record '(b) bad uuid' $okB $detailB

# --- Smoke C: valid uuid but wrong buyer -> 403 FORBIDDEN ---------------
Write-Host ''
Write-Host '=== (c) POST wrong-buyer order with auth JWT -> expect 403 FORBIDDEN ==='
$okC = $false; $detailC = ''
$cBody = ConvertTo-Json @{ order_id = $wrongOrderId } -Compress
try { Invoke-Fn 'cancel-pending-payment' $cBody $jwt | Out-Null }
catch {
  $code = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream(); $rdr = New-Object System.IO.StreamReader($stream); $body = $rdr.ReadToEnd()
  try { $err = ($body | ConvertFrom-Json).error.code } catch { $err = 'parse-err' }
  $okC = ($code -eq 403) -and ($err -eq 'FORBIDDEN')
  $detailC = "status=$code code=$err"
}
Write-Host "  $detailC"
Record '(c) wrong buyer 403' $okC $detailC

# --- Smoke D: valid buyer's placed order -> 200 + verify ----------------
Write-Host ''
Write-Host '=== (d) POST own placed order with auth JWT -> expect 200 + verify cancelled ==='
$dBody = ConvertTo-Json @{ order_id = $mineOrderId } -Compress
$dResp = Invoke-Fn 'cancel-pending-payment' $dBody $jwt
Write-Host "  response: $(ConvertTo-Json $dResp -Compress)"
$dVerif = (Invoke-Sql "SELECT (SELECT status FROM public.orders WHERE id='$mineOrderId') AS o, (SELECT status FROM public.payment_intents WHERE order_id='$mineOrderId') AS i, (SELECT last_error_code FROM public.payment_intents WHERE order_id='$mineOrderId') AS ec;")[0]
$okD = ($dResp.ok -eq $true) -and ($dVerif.o -eq 'cancelled') -and ($dVerif.i -eq 'cancelled') -and ($dVerif.ec -eq 'USER_CANCELLED')
Write-Host "  order=$($dVerif.o) intent=$($dVerif.i) last_error_code=$($dVerif.ec)"
Record '(d) own order cancelled' $okD "order=$($dVerif.o) intent=$($dVerif.i) ec=$($dVerif.ec)"

# --- Summary ----------------------------------------------------------
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
