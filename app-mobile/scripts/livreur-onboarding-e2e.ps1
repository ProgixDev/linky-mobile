# Phase LIVREUR ONBOARDING — full end-to-end verification of the 4 edge fns
# + the role-grant-on-approve. Creates throwaway *.linky.test users, exercises
# apply → list → decide → status, asserts users.roles gains 'livreur', then
# cleans up. Run:  pwsh -File scripts/livreur-onboarding-e2e.ps1
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
# Mgmt API query() returns the row array (sometimes wrapped as {value,Count} by
# PS serialization); normalize to a plain row array.
function SqlRows($q) {
  $r = Sql $q
  if ($null -ne $r -and ($r.PSObject.Properties.Name -contains 'value')) { return $r.value }
  return $r
}
function Call($path, $bodyObj, $bearer) {
  $h = @{ apikey = $anon; authorization = "Bearer $bearer"; 'content-type' = 'application/json'; 'idempotency-key' = [guid]::NewGuid().ToString() }
  try {
    return @{ ok = $true; data = (Invoke-RestMethod -Method POST -Uri "$base$path" -Headers $h -Body ($bodyObj | ConvertTo-Json -Compress -Depth 6)) }
  } catch {
    $resp = $_.Exception.Response
    $st = if ($resp) { [int]$resp.StatusCode } else { 0 }
    $raw = $_.ErrorDetails.Message
    if (-not $raw -and $resp) {
      try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $raw = $sr.ReadToEnd() } catch {}
    }
    $code = $null; $msg = $null
    if ($raw) { try { $j = $raw | ConvertFrom-Json; $code = $j.error.code; $msg = $j.error.message_fr } catch {} }
    return @{ ok = $false; status = $st; code = $code; message = $msg; raw = $raw }
  }
}

$sfx = [guid]::NewGuid().ToString().Substring(0,8)
$applEmail  = "livreur-appl-$sfx@linky.test"
$adminEmail = "livreur-admin-$sfx@linky.test"
$rejEmail   = "livreur-rej-$sfx@linky.test"
$pw = 'hunter22-test'

Banner '00. Pre-cleanup any leftover livreur test users from prior runs'
$testSet = "(select user_id from public.emails where address like 'livreur-%@linky.test')"
Sql "delete from public.admin_actions where target_id in (select id from public.livreur_applications where user_id in $testSet);" | Out-Null
Sql "delete from public.livreur_applications where user_id in $testSet or reviewed_by in $testSet;" | Out-Null
Sql "delete from public.users where id in $testSet;" | Out-Null
Pass 'pre-cleanup done'

Banner '0. Create applicant + admin + reject-applicant users'
$a = Call '/email-signup' @{ email=$applEmail; password=$pw } $anon
$adm = Call '/email-signup' @{ email=$adminEmail; password=$pw } $anon
$rej = Call '/email-signup' @{ email=$rejEmail; password=$pw } $anon
if (-not ($a.ok -and $adm.ok -and $rej.ok)) { Fail 'signup(s) failed'; throw 'cannot continue' }
$applId = $a.data.user.id; $applTok = $a.data.access_token
$admId  = $adm.data.user.id; $admTok = $adm.data.access_token
$rejId  = $rej.data.user.id; $rejTok = $rej.data.access_token
Sql "update public.users set is_admin = true where id = '$admId';" | Out-Null
Pass "applicant=$applId admin=$admId rejApplicant=$rejId (admin promoted)"

Banner '1. Status before applying -> none'
$s0 = Call '/livreur-application-status' @{} $applTok
if ($s0.ok -and $s0.data.status -eq 'none') { Pass "status=none" } else { Fail "expected none, got $($s0.data.status) / $($s0.code)" }

Banner '2. Apply without accepting terms -> MUST_ACCEPT_TERMS'
$noTerms = Call '/livreur-apply' @{ full_name='Mamadou Diallo'; city='Conakry'; vehicle_type='moto'; answers=@{ zones='Kaloum,Dixinn'; availability='Soirs et week-ends'; has_license_insurance=$true; accepts_qr_process=$false; accepts_linky_terms=$true } } $applTok
if (-not $noTerms.ok -and $noTerms.code -eq 'MUST_ACCEPT_TERMS') { Pass "MUST_ACCEPT_TERMS" } else { Fail "expected MUST_ACCEPT_TERMS, got $($noTerms.code)" }

Banner '3. Apply (valid) -> pending'
$ap = Call '/livreur-apply' @{ full_name='Mamadou Diallo'; city='Conakry'; vehicle_type='moto'; id_photo_url='https://example.com/id.jpg'; answers=@{ zones='Kaloum,Dixinn,Ratoma'; availability='Soirs et week-ends'; has_license_insurance=$true; accepts_qr_process=$true; accepts_linky_terms=$true } } $applTok
if ($ap.ok -and $ap.data.application.status -eq 'pending' -and $ap.data.application.user_id -eq $applId) { Pass "application pending id=$($ap.data.application.id)" } else { Fail "apply failed: $($ap.code) status=$($ap.data.application.status)" }
$appId = $ap.data.application.id

Banner '4. Status after applying -> pending'
$s1 = Call '/livreur-application-status' @{} $applTok
if ($s1.ok -and $s1.data.status -eq 'pending') { Pass "status=pending" } else { Fail "expected pending, got $($s1.data.status)" }

Banner '5. Re-apply while pending -> APPLICATION_PENDING (409)'
$re = Call '/livreur-apply' @{ full_name='Mamadou Diallo'; city='Conakry'; vehicle_type='velo'; answers=@{ zones='Kaloum'; availability='Tous les jours'; has_license_insurance=$false; accepts_qr_process=$true; accepts_linky_terms=$true } } $applTok
if (-not $re.ok -and $re.code -eq 'APPLICATION_PENDING') { Pass "APPLICATION_PENDING" } else { Fail "expected APPLICATION_PENDING, got $($re.code)" }

Banner '6. Non-admin cannot list -> FORBIDDEN_ADMIN'
$nl = Call '/admin-list-livreur-applications' @{ status='pending' } $applTok
if (-not $nl.ok -and $nl.code -eq 'FORBIDDEN_ADMIN') { Pass "FORBIDDEN_ADMIN" } else { Fail "expected FORBIDDEN_ADMIN, got $($nl.code)" }

Banner '7. Admin lists pending -> application visible with email joined'
$list = Call '/admin-list-livreur-applications' @{ status='pending' } $admTok
$mine = $null
if ($list.ok) { $mine = $list.data.applications | Where-Object { $_.id -eq $appId } | Select-Object -First 1 }
if ($mine) {
  $emailOk = ($mine.email -eq $applEmail)
  if ($emailOk -and $mine.fullName -eq 'Mamadou Diallo' -and $mine.vehicleType -eq 'moto' -and $mine.answers.zones) {
    Pass "listed: fullName=$($mine.fullName) email=$($mine.email) vehicle=$($mine.vehicleType) zones=$($mine.answers.zones)"
  } else { Fail "row present but shape off: email=$($mine.email) expected=$applEmail fullName=$($mine.fullName) vehicle=$($mine.vehicleType)" }
} else { Fail "application $appId not in admin pending list" }

Banner '8. Admin approves -> approved'
$dec = Call '/admin-decide-livreur-application' @{ application_id=$appId; decision='approve' } $admTok
if ($dec.ok -and $dec.data.application.status -eq 'approved') { Pass "approved" } else { Fail "approve failed: $($dec.code) status=$($dec.data.application.status)" }

Banner '9. ROLE GRANT: applicant users.roles now contains livreur'
$rolesArr = (SqlRows "select roles from public.users where id = '$applId';")[0].roles
Write-Host "  roles = $($rolesArr -join ',')" -ForegroundColor DarkGray
if ($rolesArr -contains 'livreur') { Pass "roles contains 'livreur'" } else { Fail "roles MISSING 'livreur': $($rolesArr -join ',')" }

Banner '10. Applicant status -> approved'
$s2 = Call '/livreur-application-status' @{} $applTok
if ($s2.ok -and $s2.data.status -eq 'approved') { Pass "status=approved" } else { Fail "expected approved, got $($s2.data.status)" }

Banner '11. Re-apply after approval -> ALREADY_LIVREUR (409)'
$al = Call '/livreur-apply' @{ full_name='Mamadou Diallo'; city='Conakry'; vehicle_type='moto'; answers=@{ zones='Kaloum'; availability='Soirs'; has_license_insurance=$true; accepts_qr_process=$true; accepts_linky_terms=$true } } $applTok
if (-not $al.ok -and $al.code -eq 'ALREADY_LIVREUR') { Pass "ALREADY_LIVREUR" } else { Fail "expected ALREADY_LIVREUR, got $($al.code)" }

Banner '12. Re-decide an already-approved application -> APPLICATION_NOT_PENDING (409)'
$red = Call '/admin-decide-livreur-application' @{ application_id=$appId; decision='reject'; reject_reason='changement' } $admTok
if (-not $red.ok -and $red.code -eq 'APPLICATION_NOT_PENDING') { Pass "APPLICATION_NOT_PENDING" } else { Fail "expected APPLICATION_NOT_PENDING, got $($red.code)" }

Banner '13. Reject path: apply, reject without reason -> REASON_REQUIRED, then with reason -> rejected'
$rap = Call '/livreur-apply' @{ full_name='Aissatou Bah'; city='Kindia'; vehicle_type='voiture'; answers=@{ zones='Centre'; availability='Journee'; has_license_insurance=$true; accepts_qr_process=$true; accepts_linky_terms=$true } } $rejTok
$rejAppId = $rap.data.application.id
$noReason = Call '/admin-decide-livreur-application' @{ application_id=$rejAppId; decision='reject' } $admTok
if (-not $noReason.ok -and $noReason.code -eq 'REASON_REQUIRED') { Pass "REASON_REQUIRED" } else { Fail "expected REASON_REQUIRED, got $($noReason.code)" }
$doRej = Call '/admin-decide-livreur-application' @{ application_id=$rejAppId; decision='reject'; reject_reason='Documents illisibles, merci de reprendre la photo.' } $admTok
if ($doRej.ok -and $doRej.data.application.status -eq 'rejected') { Pass "rejected" } else { Fail "reject failed: $($doRej.code)" }

Banner '14. Rejected applicant status -> rejected + reason; role NOT granted'
$s3 = Call '/livreur-application-status' @{} $rejTok
$rejRoles = (SqlRows "select roles from public.users where id = '$rejId';")[0].roles
if ($s3.ok -and $s3.data.status -eq 'rejected' -and $s3.data.reject_reason -and -not ($rejRoles -contains 'livreur')) {
  Pass "status=rejected reason='$($s3.data.reject_reason)' role not granted"
} else { Fail "expected rejected+reason+no role, got status=$($s3.data.status) reason=$($s3.data.reject_reason) roles=$($rejRoles -join ',')" }

Banner '15. Re-apply after rejection -> pending again (re-apply allowed)'
$reapply = Call '/livreur-apply' @{ full_name='Aissatou Bah'; city='Kindia'; vehicle_type='voiture'; answers=@{ zones='Centre'; availability='Journee'; has_license_insurance=$true; accepts_qr_process=$true; accepts_linky_terms=$true } } $rejTok
if ($reapply.ok -and $reapply.data.application.status -eq 'pending') { Pass "re-applied -> pending" } else { Fail "re-apply failed: $($reapply.code)" }

Banner 'CLEANUP: delete throwaway test users + their applications/audit'
Sql "delete from public.admin_actions where target_id in (select id from public.livreur_applications where user_id in ('$applId','$rejId'));" | Out-Null
Sql "delete from public.livreur_applications where user_id in ('$applId','$rejId') or reviewed_by in ('$applId','$admId','$rejId');" | Out-Null
Sql "delete from public.users where id in ('$applId','$admId','$rejId');" | Out-Null
Pass 'test users removed'

Write-Host ''
if ($script:fail -eq 0) { Write-Host 'ALL E2E CHECKS PASSED.' -ForegroundColor Green; exit 0 }
else { Write-Host "$($script:fail) check(s) FAILED." -ForegroundColor Red; exit 1 }
