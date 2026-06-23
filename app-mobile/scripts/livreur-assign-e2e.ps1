# Phase LIVREUR ASSIGNMENT — end-to-end verification of admin dispatch.
# Admin assigns an unassigned delivery to an approved livreur, confirms it now
# appears in that livreur's list-livreur-deliveries, exercises reassign + the
# guards, then RESTORES the real delivery/order to their original state and
# deletes the throwaway users. Run: pwsh -File scripts/livreur-assign-e2e.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$envVars = @{}
foreach ($line in (Get-Content (Join-Path $root '.env'))) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') { $envVars[$matches[1]] = $matches[2].Trim('"') }
}
$base = $envVars['EXPO_PUBLIC_SUPABASE_URL'] + '/functions/v1'
$anon = $envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY']
$pat  = $envVars['SUPABASE_ACCESS_TOKEN']
$ref  = 'fvvqgcsphwrmdlclnxcz'
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"

$script:fail = 0
function Pass($t){ Write-Host "  PASS: $t" -ForegroundColor Green }
function Fail($t){ Write-Host "  FAIL: $t" -ForegroundColor Red; $script:fail++ }
function Banner($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Sql($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3 -Compress
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers @{ Authorization = "Bearer $pat" } -Body $body -ContentType 'application/json'
}
function SqlRows($q) { $r = Sql $q; if ($null -ne $r -and ($r.PSObject.Properties.Name -contains 'value')) { return $r.value }; return $r }
function Call($path, $bodyObj, $bearer) {
  $h = @{ apikey = $anon; authorization = "Bearer $bearer"; 'content-type' = 'application/json'; 'idempotency-key' = [guid]::NewGuid().ToString() }
  try { return @{ ok = $true; data = (Invoke-RestMethod -Method POST -Uri "$base$path" -Headers $h -Body ($bodyObj | ConvertTo-Json -Compress -Depth 6)) } }
  catch {
    $resp = $_.Exception.Response; $st = if ($resp) { [int]$resp.StatusCode } else { 0 }
    $raw = $_.ErrorDetails.Message
    if (-not $raw -and $resp) { try { $raw = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch {} }
    $code = $null; if ($raw) { try { $code = ($raw | ConvertFrom-Json).error.code } catch {} }
    return @{ ok = $false; status = $st; code = $code; raw = $raw }
  }
}

$sfx = [guid]::NewGuid().ToString().Substring(0,8)
$pw = 'hunter22-test'
Banner '00. Pre-cleanup leftover assign-test users'
$ts = "(select user_id from public.emails where address like 'assign-%@linky.test')"
Sql "delete from public.notifications where user_id in $ts;" | Out-Null
Sql "delete from public.livreur_applications where user_id in $ts or reviewed_by in $ts;" | Out-Null
Sql "delete from public.users where id in $ts;" | Out-Null
Pass 'pre-cleanup done'

Banner '0. Create admin + 2 livreurs (role + approved application)'
$adm = Call '/email-signup' @{ email="assign-admin-$sfx@linky.test"; password=$pw } $anon
$l1  = Call '/email-signup' @{ email="assign-l1-$sfx@linky.test"; password=$pw } $anon
$l2  = Call '/email-signup' @{ email="assign-l2-$sfx@linky.test"; password=$pw } $anon
$admId=$adm.data.user.id; $admTok=$adm.data.access_token
$l1Id=$l1.data.user.id; $l1Tok=$l1.data.access_token
$l2Id=$l2.data.user.id; $l2Tok=$l2.data.access_token
Sql "update public.users set is_admin=true where id='$admId';" | Out-Null
Sql "update public.users set display_name='Livreur Un', roles=array_append(roles,'livreur') where id='$l1Id' and not ('livreur'=any(roles));" | Out-Null
Sql "update public.users set display_name='Livreur Deux', roles=array_append(roles,'livreur') where id='$l2Id' and not ('livreur'=any(roles));" | Out-Null
Sql "insert into public.livreur_applications (user_id, full_name, city, vehicle_type, answers, status, reviewed_at) values ('$l1Id','Livreur Un','Conakry','moto','{}'::jsonb,'approved',now()), ('$l2Id','Livreur Deux','Kindia','voiture','{}'::jsonb,'approved',now());" | Out-Null
Pass "admin=$admId L1=$l1Id L2=$l2Id"

Banner '1. Pick an unassigned delivery on a paid/preparing order; snapshot for restore'
$target = (SqlRows "select d.id as delivery_id, d.order_id, o.reference, o.events::text as events from public.deliveries d join public.orders o on o.id=d.order_id where d.status='unassigned' and o.status in ('paid','preparing') order by d.created_at desc limit 1;")[0]
$delId = $target.delivery_id; $ordId = $target.order_id; $ordRef = $target.reference
$cancelled = (SqlRows "select d.id as delivery_id from public.deliveries d join public.orders o on o.id=d.order_id where d.status='unassigned' and o.status='cancelled' limit 1;")[0]
$cancelDelId = $cancelled.delivery_id
Pass "target delivery=$delId order=$ordRef ; cancelled-order delivery=$cancelDelId"

Banner '2. admin-list-deliveries (unassigned) -> target visible with order ref'
$ld = Call '/admin-list-deliveries' @{ status='unassigned' } $admTok
$row = $null; if ($ld.ok) { $row = $ld.data.deliveries | Where-Object { $_.id -eq $delId } | Select-Object -First 1 }
if ($row -and $row.order.reference -eq $ordRef) { Pass "listed ref=$($row.order.reference) status=$($row.status)" } else { Fail "target not listed or shape off (ok=$($ld.ok) code=$($ld.code))" }

Banner '3. admin-list-livreurs -> both livreurs, city/vehicle, active=0'
$ll = Call '/admin-list-livreurs' @{} $admTok
$r1 = $null; $r2 = $null
if ($ll.ok) { $r1 = $ll.data.livreurs | Where-Object { $_.id -eq $l1Id } | Select-Object -First 1; $r2 = $ll.data.livreurs | Where-Object { $_.id -eq $l2Id } | Select-Object -First 1 }
if ($r1 -and $r1.city -eq 'Conakry' -and $r1.vehicleType -eq 'moto' -and $r1.activeDeliveries -eq 0 -and $r2 -and $r2.vehicleType -eq 'voiture') {
  Pass "L1(Conakry/moto/active0) L2(Kindia/voiture) present"
} else { Fail "livreurs shape off: r1=$($r1 | ConvertTo-Json -Compress) r2=$($r2 | ConvertTo-Json -Compress)" }

Banner '4. Non-admin assign -> FORBIDDEN_ADMIN'
$na = Call '/admin-assign-delivery' @{ delivery_id=$delId; livreur_id=$l1Id } $l1Tok
if (-not $na.ok -and $na.code -eq 'FORBIDDEN_ADMIN') { Pass 'FORBIDDEN_ADMIN' } else { Fail "expected FORBIDDEN_ADMIN got $($na.code)" }

Banner '5. Assign target to L1 -> assigned'
$as = Call '/admin-assign-delivery' @{ delivery_id=$delId; livreur_id=$l1Id } $admTok
if ($as.ok -and $as.data.delivery.status -eq 'assigned' -and $as.data.delivery.assignedLivreur.id -eq $l1Id) { Pass "assigned to L1 (name=$($as.data.delivery.assignedLivreur.name))" } else { Fail "assign failed: $($as.code)" }

Banner '6. L1 list-livreur-deliveries -> contains the delivery'
$l1list = Call '/list-livreur-deliveries' @{} $l1Tok
$found = $false; if ($l1list.ok) { $found = [bool]($l1list.data.deliveries | Where-Object { $_.id -eq $delId }) }
if ($found) { Pass 'delivery now in L1 list' } else { Fail "delivery NOT in L1 list (ok=$($l1list.ok))" }

Banner '7. admin-list-livreurs -> L1 active=1'
$ll2 = Call '/admin-list-livreurs' @{} $admTok
$r1b = if ($ll2.ok) { $ll2.data.livreurs | Where-Object { $_.id -eq $l1Id } | Select-Object -First 1 } else { $null }
if ($r1b -and $r1b.activeDeliveries -eq 1) { Pass 'L1 activeDeliveries=1' } else { Fail "expected L1 active=1 got $($r1b.activeDeliveries)" }

Banner '8. Reassign target to L2 -> assigned to L2'
$re = Call '/admin-assign-delivery' @{ delivery_id=$delId; livreur_id=$l2Id } $admTok
if ($re.ok -and $re.data.delivery.assignedLivreur.id -eq $l2Id) { Pass 'reassigned to L2' } else { Fail "reassign failed: $($re.code)" }

Banner '9. After reassign: in L2 list, NOT in L1 list'
$l2list = Call '/list-livreur-deliveries' @{} $l2Tok
$l1list2 = Call '/list-livreur-deliveries' @{} $l1Tok
$inL2 = [bool]($l2list.data.deliveries | Where-Object { $_.id -eq $delId })
$inL1 = [bool]($l1list2.data.deliveries | Where-Object { $_.id -eq $delId })
if ($inL2 -and -not $inL1) { Pass 'moved L1 -> L2' } else { Fail "reassign visibility off (inL2=$inL2 inL1=$inL1)" }

Banner '10. Assign to a non-livreur (the admin) -> NOT_A_LIVREUR'
$nl = Call '/admin-assign-delivery' @{ delivery_id=$delId; livreur_id=$admId } $admTok
if (-not $nl.ok -and $nl.code -eq 'NOT_A_LIVREUR') { Pass 'NOT_A_LIVREUR' } else { Fail "expected NOT_A_LIVREUR got $($nl.code)" }

Banner '11. Assign a cancelled-order delivery -> INVALID_ORDER_STATUS'
if ($cancelDelId) {
  $inv = Call '/admin-assign-delivery' @{ delivery_id=$cancelDelId; livreur_id=$l1Id } $admTok
  if (-not $inv.ok -and $inv.code -eq 'INVALID_ORDER_STATUS') { Pass 'INVALID_ORDER_STATUS' } else { Fail "expected INVALID_ORDER_STATUS got $($inv.code)" }
} else { Write-Host '  (skip: no cancelled-order delivery available)' -ForegroundColor DarkGray }

Banner '12. Unknown delivery -> DELIVERY_NOT_FOUND'
$dnf = Call '/admin-assign-delivery' @{ delivery_id='00000000-0000-0000-0000-000000000000'; livreur_id=$l1Id } $admTok
if (-not $dnf.ok -and $dnf.code -eq 'DELIVERY_NOT_FOUND') { Pass 'DELIVERY_NOT_FOUND' } else { Fail "expected DELIVERY_NOT_FOUND got $($dnf.code)" }

Banner 'RESTORE: revert the real delivery + strip test-injected order events'
Sql "update public.deliveries set livreur_id=null, status='unassigned', assigned_at=null, updated_at=now() where id='$delId';" | Out-Null
Sql "update public.orders set events = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(events) e where coalesce(e->>'by_admin','') <> '$admId') where id='$ordId';" | Out-Null
$restored = (SqlRows "select status, livreur_id from public.deliveries where id='$delId';")[0]
if ($restored.status -eq 'unassigned' -and -not $restored.livreur_id) { Pass 'delivery restored to unassigned' } else { Fail "restore off: status=$($restored.status) livreur=$($restored.livreur_id)" }

Banner 'CLEANUP: delete throwaway users + their applications + push rows'
Sql "delete from public.notifications where user_id in ('$admId','$l1Id','$l2Id');" | Out-Null
Sql "delete from public.livreur_applications where user_id in ('$l1Id','$l2Id') or reviewed_by in ('$admId','$l1Id','$l2Id');" | Out-Null
Sql "delete from public.users where id in ('$admId','$l1Id','$l2Id');" | Out-Null
Pass 'test users removed'

Write-Host ''
if ($script:fail -eq 0) { Write-Host 'ALL ASSIGNMENT E2E CHECKS PASSED.' -ForegroundColor Green; exit 0 }
else { Write-Host "$($script:fail) check(s) FAILED." -ForegroundColor Red; exit 1 }
