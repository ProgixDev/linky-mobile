# Phase 2a auth — end-to-end smoke test.
# Verifies: signup, signin, refresh rotation, refresh-reuse-detection (chain-kill),
# bad password, signin rate limit, idempotency replay (no tokens in cached response).
#
# Run with:  pwsh -File scripts/smoke-auth.ps1
# Requires:  EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY readable from .env

$ErrorActionPreference = 'Stop'

# --- Config from .env ----------------------------------------------------
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }

$envVars = @{}
foreach ($line in (Get-Content $envFile)) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') {
    $envVars[$matches[1]] = $matches[2]
  }
}
$base   = $envVars['EXPO_PUBLIC_SUPABASE_URL'] + '/functions/v1'
$apikey = $envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY']
if (-not $base -or -not $apikey) { throw 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env' }

$baseHeaders = @{
  'apikey'        = $apikey
  'authorization' = "Bearer $apikey"
  'content-type'  = 'application/json'
}

function Call {
  param([string]$Path, [string]$Body, [string]$IdemKey)
  $h = $baseHeaders.Clone()
  $h['idempotency-key'] = if ($IdemKey) { $IdemKey } else { [Guid]::NewGuid().ToString() }
  try {
    return @{ ok = $true; data = (Invoke-RestMethod -Method POST -Uri "$base$Path" -Headers $h -Body $Body) }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body   = $_.ErrorDetails.Message
    $code   = $null
    $msg    = $null
    try {
      $j = $body | ConvertFrom-Json
      if ($j.error) { $code = $j.error.code; $msg = $j.error.message_fr }
    } catch { }
    return @{ ok = $false; status = $status; code = $code; message = $msg; raw = $body }
  }
}

function Banner { param($Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Pass   { param($Text) Write-Host "  PASS: $Text" -ForegroundColor Green }
function Fail   { param($Text) Write-Host "  FAIL: $Text" -ForegroundColor Red; $script:failCount++ }

$script:failCount = 0
$email = "smoke-$([Guid]::NewGuid().ToString().Substring(0,8))@linky.test"
$pw    = 'hunter22-test'
Write-Host "Test email: $email" -ForegroundColor DarkGray
Write-Host "Base URL:   $base" -ForegroundColor DarkGray

# --- 1) email-signup ----------------------------------------------------
Banner '1. email-signup happy path'
$s = Call '/email-signup' "{`"email`":`"$email`",`"password`":`"$pw`"}"
if (-not $s.ok)                    { Fail "signup failed: $($s.status) $($s.code) $($s.message)" }
elseif (-not $s.data.access_token) { Fail 'signup ok but no access_token' }
elseif (-not $s.data.refresh_token){ Fail 'signup ok but no refresh_token' }
elseif (-not $s.data.user.id)      { Fail 'signup ok but no user.id' }
else                               { Pass "user_id=$($s.data.user.id), access=$($s.data.access_token.Length)ch, refresh=$($s.data.refresh_token.Length)ch" }
$userId = $s.data.user.id

# --- 2) signup duplicate -> 409 ----------------------------------------
Banner '2. email-signup duplicate -> 409 EMAIL_ALREADY_REGISTERED (verifies 2C transactional create)'
$dup = Call '/email-signup' "{`"email`":`"$email`",`"password`":`"$pw`"}"
if     ($dup.ok)                            { Fail 'duplicate signup unexpectedly succeeded' }
elseif ($dup.status -ne 409)                { Fail "expected 409, got $($dup.status)" }
elseif ($dup.code -ne 'EMAIL_ALREADY_REGISTERED') { Fail "expected EMAIL_ALREADY_REGISTERED, got $($dup.code)" }
else                                        { Pass "409 EMAIL_ALREADY_REGISTERED" }

# --- 3) signin happy path ----------------------------------------------
Banner '3. email-signin happy path (same creds)'
$i = Call '/email-signin' "{`"email`":`"$email`",`"password`":`"$pw`"}"
if     (-not $i.ok)                       { Fail "signin failed: $($i.status) $($i.code)" }
elseif ($i.data.user.id -ne $userId)      { Fail "user_id mismatch: $($i.data.user.id) vs $userId" }
else                                       { Pass "signin ok, same user_id" }
$signinRefresh = $i.data.refresh_token

# --- 4) refresh rotation -----------------------------------------------
Banner '4. session-refresh rotates the token'
$r1 = Call '/session-refresh' "{`"refresh_token`":`"$signinRefresh`"}"
if     (-not $r1.ok)                                   { Fail "refresh failed: $($r1.status) $($r1.code)" }
elseif ($r1.data.refresh_token -eq $signinRefresh)     { Fail 'refresh did not rotate (token unchanged)' }
elseif (-not $r1.data.access_token)                    { Fail 'refresh returned no access_token' }
else                                                    { Pass "rotated to new refresh" }
$rotatedRefresh = $r1.data.refresh_token

# --- 5) refresh again to make a chain ----------------------------------
Banner '5. session-refresh once more (3-deep chain)'
$r2 = Call '/session-refresh' "{`"refresh_token`":`"$rotatedRefresh`"}"
if     (-not $r2.ok)                                  { Fail "second refresh failed: $($r2.status)" }
elseif ($r2.data.refresh_token -eq $rotatedRefresh)   { Fail 'second refresh did not rotate' }
else                                                   { Pass "rotated again" }
$thirdRefresh = $r2.data.refresh_token

# --- 6) 1B: present REVOKED token -> chain-kill ------------------------
Banner '6. 1B: present the ORIGINAL (now-revoked) refresh -> REUSE_DETECTED + chain killed'
$reuse = Call '/session-refresh' "{`"refresh_token`":`"$signinRefresh`"}"
if     ($reuse.ok)                                            { Fail 'revoked token was accepted!' }
elseif ($reuse.code -ne 'REFRESH_TOKEN_REUSE_DETECTED')       { Fail "expected REFRESH_TOKEN_REUSE_DETECTED, got $($reuse.code)" }
else                                                           { Pass "401 REFRESH_TOKEN_REUSE_DETECTED" }

# Verify chain-kill: the THIRD refresh (which was valid before) should now also be dead
Banner '7. 1B: verify chain-kill — current valid refresh now also rejected'
$afterKill = Call '/session-refresh' "{`"refresh_token`":`"$thirdRefresh`"}"
if     ($afterKill.ok)                                                { Fail 'chain-kill failed: current refresh still works' }
elseif ($afterKill.code -ne 'REFRESH_TOKEN_REUSE_DETECTED' -and `
        $afterKill.code -ne 'REFRESH_TOKEN_INVALID')                 { Fail "expected REUSE_DETECTED or INVALID, got $($afterKill.code)" }
else                                                                   { Pass "current refresh also dead: $($afterKill.code)" }

# --- 8) bad password ---------------------------------------------------
Banner '8. email-signin with wrong password -> AUTH_INVALID_CREDENTIALS'
$bad = Call '/email-signin' "{`"email`":`"$email`",`"password`":`"WRONG-$([Guid]::NewGuid())`"}"
if     ($bad.ok)                                       { Fail 'bad password accepted!' }
elseif ($bad.code -ne 'AUTH_INVALID_CREDENTIALS')      { Fail "expected AUTH_INVALID_CREDENTIALS, got $($bad.code)" }
else                                                    { Pass "401 AUTH_INVALID_CREDENTIALS" }

# --- 9) 2E: constant-time check (existing vs non-existing email) ------
Banner '9. 2E: timing-equality check (existing email + wrong pw vs unknown email + any pw)'
$nonexistent = "missing-$([Guid]::NewGuid().ToString().Substring(0,8))@linky.test"
$swExist = [System.Diagnostics.Stopwatch]::StartNew()
$_ = Call '/email-signin' "{`"email`":`"$email`",`"password`":`"WRONG-$([Guid]::NewGuid())`"}"
$swExist.Stop()
$swMiss = [System.Diagnostics.Stopwatch]::StartNew()
$_ = Call '/email-signin' "{`"email`":`"$nonexistent`",`"password`":`"any-password-here`"}"
$swMiss.Stop()
$diff = [Math]::Abs($swExist.ElapsedMilliseconds - $swMiss.ElapsedMilliseconds)
Write-Host "  exists: $($swExist.ElapsedMilliseconds)ms  miss: $($swMiss.ElapsedMilliseconds)ms  diff: ${diff}ms" -ForegroundColor DarkGray
if ($diff -gt 150) { Fail "timing diff ${diff}ms > 150ms threshold — bcrypt may not be running on miss path" }
else               { Pass "timing diff ${diff}ms within tolerance (both paths run bcrypt)" }

# --- 10) 2F: rate limit kicks in --------------------------------------
Banner '10. 2F: 5 failed signins on same email -> 6th is SIGNIN_RATE_LIMITED'
# Use a NEW user to avoid noise from the bad attempts above
$rateEmail = "ratelimit-$([Guid]::NewGuid().ToString().Substring(0,8))@linky.test"
$ratePw    = 'hunter22-test'
$_ = Call '/email-signup' "{`"email`":`"$rateEmail`",`"password`":`"$ratePw`"}"
$rateHit = $false
for ($n = 1; $n -le 6; $n++) {
  $rr = Call '/email-signin' "{`"email`":`"$rateEmail`",`"password`":`"WRONG-$n`"}"
  if ($rr.code -eq 'SIGNIN_RATE_LIMITED') {
    Write-Host "  attempt $n -> SIGNIN_RATE_LIMITED" -ForegroundColor DarkGray
    $rateHit = $true; break
  } else {
    Write-Host "  attempt $n -> $($rr.code)" -ForegroundColor DarkGray
  }
}
if ($rateHit) { Pass 'rate limit fired within 6 attempts' }
else          { Fail 'rate limit did not fire after 6 failed attempts — 2F may be misconfigured' }

# --- 11) 1A: idempotency cache scrubs tokens --------------------------
Banner '11. 1A: idempotency replay returns user only (no tokens in cached body)'
$idemEmail = "idem-$([Guid]::NewGuid().ToString().Substring(0,8))@linky.test"
$idemKey   = [Guid]::NewGuid().ToString()
$first     = Call '/email-signup' "{`"email`":`"$idemEmail`",`"password`":`"$pw`"}" $idemKey
if (-not $first.ok) {
  Fail "initial signup for idem test failed: $($first.code)"
} else {
  $replay = Call '/email-signup' "{`"email`":`"$idemEmail`",`"password`":`"$pw`"}" $idemKey
  if (-not $replay.ok) {
    Fail "idem replay failed: $($replay.code)"
  } elseif ($replay.data.access_token -or $replay.data.refresh_token) {
    Fail "idem replay returned tokens! access=$([bool]$replay.data.access_token) refresh=$([bool]$replay.data.refresh_token)"
  } elseif (-not $replay.data.user.id) {
    Fail 'idem replay missing user.id'
  } else {
    Pass "replay returned user only, tokens scrubbed"
  }
}

# --- Summary ---
Write-Host ''
if ($script:failCount -eq 0) {
  Write-Host "All checks passed." -ForegroundColor Green
  exit 0
} else {
  Write-Host "$($script:failCount) check(s) failed." -ForegroundColor Red
  exit 1
}
