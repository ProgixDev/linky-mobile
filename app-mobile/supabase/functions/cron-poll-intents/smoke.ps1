# Phase I.3 cron-poll-intents smoke. Covers 5 scenarios:
#   S1: mock-success path - cron flips intent->completed + order->paid + escrow credited
#   S2: mock-fail path - cron flips intent->failed + order->cancelled, no fund movement
#   S3: 15-min TTL expiry - clean-pending intent expires, order cancelled
#   S4: S5 defer - transient-error-tagged intent does NOT expire
#   S5: concurrency - two rapid cron calls do not double-process
#
# Setup data is synthetic, FK-valid (clones IDs from an existing H2 order).
# Idempotent: each run synthesizes fresh reference IDs.
# Reset: DELETE FROM public.payment_intents WHERE rail_intent_id LIKE 'smoke-%';
#        DELETE FROM public.orders WHERE reference LIKE 'SMK-%';

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ref = 'fvvqgcsphwrmdlclnxcz'
$supaUrl = "https://$ref.supabase.co"
$mockBase = "$supaUrl/functions/v1/mock-lengopay"
$cronUrl = "$supaUrl/functions/v1/cron-poll-intents"

# Read LINKY_CRON_SECRET from migration 02 (the same value the deployed
# cron-poll-intents function expects in x-cron-secret header).
$migPath = Join-Path $root 'supabase\migrations\20260601_02_kick_function_secret.sql'
$migContent = [System.IO.File]::ReadAllText($migPath)
$secretMatch = [regex]::Match($migContent, "v_cron_secret text := '([^']+)'")
if (-not $secretMatch.Success) { throw 'Could not parse LINKY_CRON_SECRET from migration 02' }
$cronSecret = $secretMatch.Groups[1].Value

# Anon key + PAT
$apikey = (Get-Content (Join-Path $root '.env') | Select-String 'EXPO_PUBLIC_SUPABASE_ANON_KEY=' | ForEach-Object { $_.Line.Split('=',2)[1].Trim() })
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')

function Invoke-Sql($sql) {
  $body = ConvertTo-Json @{ query = $sql } -Depth 20 -Compress
  return Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
    -Method Post -Headers @{ Authorization = "Bearer $pat" } -Body $body -ContentType 'application/json'
}

function Invoke-Cron {
  $body = ConvertTo-Json @{ source = 'smoke' } -Compress
  return Invoke-RestMethod -Uri $cronUrl -Method Post `
    -Headers @{
      'apikey' = $apikey
      'Authorization' = "Bearer $apikey"
      'x-cron-secret' = $cronSecret
      'Content-Type' = 'application/json'
    } -Body $body
}

function Invoke-MockInit($phone) {
  $body = ConvertTo-Json @{
    amount = '4944000'; currency = 'GNF'; website_id = 'smoke'
    account_type = 'lp-om-gn'; account_number = $phone
  } -Compress
  return Invoke-RestMethod -Uri "$mockBase/init-payment" -Method Post `
    -Headers @{ 'apikey' = $apikey; 'Authorization' = "Bearer $apikey"; 'Content-Type' = 'application/json' } `
    -Body $body
}

$results = @()
function Record($name, $ok, $detail) { $script:results += [pscustomobject]@{ name=$name; ok=$ok; detail=$detail } }

# Clone FK-valid IDs from an existing H2 order.
$ref_query = Invoke-Sql "SELECT id::text, buyer_id::text AS buyer_id, seller_id::text AS seller_id, shop_id::text AS shop_id, product_id::text AS product_id FROM public.orders ORDER BY created_at DESC LIMIT 1;"
$refOrder = $ref_query[0]
Write-Host "Cloning FK template from order $($refOrder.id)"

# Escrow balance before smoke (used as baseline for S1 verification).
$escrowBefore_q = Invoke-Sql "SELECT COALESCE((SELECT balance_after FROM public.ledger_entries WHERE wallet_id = (SELECT id FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-000000000001' AND currency = 'GNF') ORDER BY created_at DESC, id DESC LIMIT 1), 0)::text AS bal;"
$escrowBefore = [int64]$escrowBefore_q[0].bal
Write-Host "escrow_gnf baseline: $escrowBefore"

function New-SmokeOrderAndIntent($refSuffix, $payId, $payerPhone, $backdateMinutes = 0, $lastErrorCode = $null, [bool]$lastPolledAtRecent = $false) {
  $smokeRef = "SMK-$refSuffix"
  $createdAt = if ($backdateMinutes -gt 0) { "now() - interval '$backdateMinutes minutes'" } else { 'now()' }
  $lastErr = if ($null -eq $lastErrorCode) { 'null' } else { "'$lastErrorCode'" }
  $lastPolled = if ($lastPolledAtRecent) { "now() - interval '30 seconds'" } else { 'null' }

  Invoke-Sql @"
INSERT INTO public.orders (
  reference, buyer_id, seller_id, shop_id, product_id, product_snapshot,
  quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events
) VALUES (
  '$smokeRef', '$($refOrder.buyer_id)'::uuid, '$($refOrder.seller_id)'::uuid,
  '$($refOrder.shop_id)'::uuid, '$($refOrder.product_id)'::uuid,
  '{"title":"SMOKE","photo":"","priceGnf":4800000}'::jsonb,
  1, 4800000, 144000, 4944000, 'orange-money', 'GNF', 'placed',
  jsonb_build_array(jsonb_build_object('at', now(), 'label', 'Commande passée'))
);
"@ | Out-Null

  $orderRow = Invoke-Sql "SELECT id::text FROM public.orders WHERE reference = '$smokeRef';"
  $orderId = $orderRow[0].id

  Invoke-Sql @"
INSERT INTO public.payment_intents
  (order_id, rail, rail_intent_id, method, currency, amount_minor, payer_phone, created_at, last_error_code, last_polled_at)
VALUES (
  '$orderId'::uuid, 'lengopay', '$payId', 'orange-money', 'GNF', 4944000,
  '$payerPhone', $createdAt, $lastErr, $lastPolled
);
"@ | Out-Null

  return @{ orderId = $orderId; ref = $smokeRef }
}

# --- S1: mock-success ---
Write-Host ''
Write-Host '=== S1: mock-success path ==='
$init1 = Invoke-MockInit '+224622551288'
$smk1 = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $init1.pay_id '+224622551288'
Write-Host "  setup: order=$($smk1.ref) intent_id=$($init1.pay_id)"
Write-Host '  waiting 11s for mock to flip success...'
Start-Sleep -Seconds 11
$tick1 = Invoke-Cron
Write-Host "  cron tick: $(ConvertTo-Json $tick1 -Compress)"
$v1 = Invoke-Sql "SELECT (SELECT status FROM public.orders WHERE id = '$($smk1.orderId)') AS o, (SELECT status FROM public.payment_intents WHERE order_id = '$($smk1.orderId)') AS i;"
$ok1 = ($v1[0].o -eq 'paid') -and ($v1[0].i -eq 'completed')
Write-Host "  order=$($v1[0].o) intent=$($v1[0].i)"
Record 'S1 mock-success' $ok1 "order=$($v1[0].o) intent=$($v1[0].i)"

# Verify escrow credited by 4944000
$escrowAfterS1_q = Invoke-Sql "SELECT COALESCE((SELECT balance_after FROM public.ledger_entries WHERE wallet_id = (SELECT id FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-000000000001' AND currency = 'GNF') ORDER BY created_at DESC, id DESC LIMIT 1), 0)::text AS bal;"
$escrowAfterS1 = [int64]$escrowAfterS1_q[0].bal
$escrowDelta1 = $escrowAfterS1 - $escrowBefore
$okEscrow1 = $escrowDelta1 -eq 4944000
Write-Host "  escrow delta: $escrowDelta1 (expected 4944000)"
Record 'S1 escrow credited' $okEscrow1 "delta=$escrowDelta1"

# --- S2: mock-fail (insufficient) ---
Write-Host ''
Write-Host '=== S2: mock-fail (insufficient balance) ==='
$init2 = Invoke-MockInit '+224999999990'
$smk2 = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $init2.pay_id '+224999999990'
Write-Host "  setup: order=$($smk2.ref) intent_id=$($init2.pay_id)"
Write-Host '  waiting 13s for mock flip + auto-cron processing (mock window 5s + next auto-tick + slack)...'
Start-Sleep -Seconds 13
$tick2 = Invoke-Cron
Write-Host "  cron tick: $(ConvertTo-Json $tick2 -Compress)"
$v2 = Invoke-Sql "SELECT (SELECT status FROM public.orders WHERE id = '$($smk2.orderId)') AS o, (SELECT status FROM public.payment_intents WHERE order_id = '$($smk2.orderId)') AS i, (SELECT last_error_code FROM public.payment_intents WHERE order_id = '$($smk2.orderId)') AS ec;"
$ok2 = ($v2[0].o -eq 'cancelled') -and ($v2[0].i -eq 'failed') -and ($v2[0].ec -eq 'INSUFFICIENT_BALANCE')
Write-Host "  order=$($v2[0].o) intent=$($v2[0].i) error_code=$($v2[0].ec)"
Record 'S2 mock-fail' $ok2 "order=$($v2[0].o) intent=$($v2[0].i) ec=$($v2[0].ec)"

# Escrow should NOT have changed for S2
$escrowAfterS2_q = Invoke-Sql "SELECT COALESCE((SELECT balance_after FROM public.ledger_entries WHERE wallet_id = (SELECT id FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-000000000001' AND currency = 'GNF') ORDER BY created_at DESC, id DESC LIMIT 1), 0)::text AS bal;"
$escrowAfterS2 = [int64]$escrowAfterS2_q[0].bal
$okEscrow2 = $escrowAfterS2 -eq $escrowAfterS1
Write-Host "  escrow unchanged: $escrowAfterS2 (S1 baseline $escrowAfterS1)"
Record 'S2 no fund movement' $okEscrow2 "after=$escrowAfterS2"

# --- S3: 15-min TTL expiry (clean pending) ---
Write-Host ''
Write-Host '=== S3: 15-min TTL expiry (clean pending) ==='
$payId3 = "smoke-ttl-clean-$([guid]::NewGuid().ToString().Substring(0,8))"
$smk3 = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $payId3 '+224622000003' 16 $null
Write-Host "  setup: order=$($smk3.ref) intent_id=$payId3 backdated 16 min, last_error_code=null"
$tick3 = Invoke-Cron
Write-Host "  cron tick: $(ConvertTo-Json $tick3 -Compress)"
$v3 = Invoke-Sql "SELECT (SELECT status FROM public.orders WHERE id = '$($smk3.orderId)') AS o, (SELECT status FROM public.payment_intents WHERE order_id = '$($smk3.orderId)') AS i;"
$ok3 = ($v3[0].o -eq 'cancelled') -and ($v3[0].i -eq 'expired')
Write-Host "  order=$($v3[0].o) intent=$($v3[0].i)"
Record 'S3 TTL expiry clean' $ok3 "order=$($v3[0].o) intent=$($v3[0].i)"

# --- S4: S5 defer (transient error) ---
Write-Host ''
Write-Host '=== S4: S5 defer (transient error) ==='
$payId4 = "smoke-ttl-transient-$([guid]::NewGuid().ToString().Substring(0,8))"
$smk4 = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $payId4 '+224622000004' 16 'RAIL_TRANSIENT' $true
Write-Host "  setup: order=$($smk4.ref) intent_id=$payId4 backdated 16 min, last_error_code='RAIL_TRANSIENT', last_polled_at='now()-30s'"
$tick4 = Invoke-Cron
Write-Host "  cron tick: $(ConvertTo-Json $tick4 -Compress)"
$v4 = Invoke-Sql "SELECT (SELECT status FROM public.orders WHERE id = '$($smk4.orderId)') AS o, (SELECT status FROM public.payment_intents WHERE order_id = '$($smk4.orderId)') AS i;"
# Note: cron worker may have polled this intent (rail_intent_id is fake, getPaymentStatus will throw),
# bumping it. Either way, expire_stale_intents should defer it.
# Intent should remain 'pending'. Order should remain 'placed'.
$ok4 = ($v4[0].o -eq 'placed') -and ($v4[0].i -eq 'pending')
Write-Host "  order=$($v4[0].o) intent=$($v4[0].i)"
Record 'S4 S5 defer transient' $ok4 "order=$($v4[0].o) intent=$($v4[0].i)"

# --- S5: concurrency (2 rapid cron calls, no double-processing) ---
Write-Host ''
Write-Host '=== S5: concurrency (2 rapid cron calls) ==='
$init5a = Invoke-MockInit '+224622551288'
$init5b = Invoke-MockInit '+224622551288'
$init5c = Invoke-MockInit '+224622551288'
$smk5a = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $init5a.pay_id '+224622551288'
$smk5b = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $init5b.pay_id '+224622551288'
$smk5c = New-SmokeOrderAndIntent ([guid]::NewGuid().ToString().Substring(0,8)) $init5c.pay_id '+224622551288'
Write-Host '  3 pending intents inserted; waiting 11s for mocks to flip...'
Start-Sleep -Seconds 11
$tick5a = Invoke-Cron
$tick5b = Invoke-Cron
Write-Host "  tick A: $(ConvertTo-Json $tick5a -Compress)"
Write-Host "  tick B: $(ConvertTo-Json $tick5b -Compress)"
$v5 = Invoke-Sql @"
SELECT
  (SELECT status FROM public.payment_intents WHERE order_id = '$($smk5a.orderId)') AS a,
  (SELECT status FROM public.payment_intents WHERE order_id = '$($smk5b.orderId)') AS b,
  (SELECT status FROM public.payment_intents WHERE order_id = '$($smk5c.orderId)') AS c,
  (SELECT count(*) FROM public.ledger_entries
     WHERE ref_id IN ('$($smk5a.orderId)'::uuid, '$($smk5b.orderId)'::uuid, '$($smk5c.orderId)'::uuid)
       AND ref_type = 'order_escrow')::text AS ledger_count;
"@
$row5 = $v5[0]
$ok5 = ($row5.a -eq 'completed') -and ($row5.b -eq 'completed') -and ($row5.c -eq 'completed') -and ([int]$row5.ledger_count -eq 3)
Write-Host "  intents: a=$($row5.a) b=$($row5.b) c=$($row5.c)"
Write-Host "  ledger entries for these orders: $($row5.ledger_count) (expected 3, one per order)"
Record 'S5 concurrency no double-process' $ok5 "a=$($row5.a) b=$($row5.b) c=$($row5.c) ledger=$($row5.ledger_count)"

# --- Summary ---
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
