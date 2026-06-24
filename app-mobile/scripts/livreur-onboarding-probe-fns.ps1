# Garbage-bearer probe: confirms verify_jwt is OFF (our code runs, not a
# platform 401) and our self-rolled requireUser/assertAdmin gate works.
# A healthy result is a JSON { error: { code } } from OUR function.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
function EnvVal($key) {
  (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
}
$anon = EnvVal 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
$url  = EnvVal 'EXPO_PUBLIC_SUPABASE_URL'
if (-not $anon) { throw 'anon key missing' }

function Probe($slug, $body) {
  $headers = @{
    apikey            = $anon
    Authorization     = 'Bearer garbage.token.value'
    'idempotency-key' = [guid]::NewGuid().ToString()
    'content-type'    = 'application/json'
  }
  try {
    $resp = Invoke-WebRequest -Uri "$url/functions/v1/$slug" -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Compress) -UseBasicParsing
    Write-Host "$slug -> HTTP $($resp.StatusCode) $($resp.Content)"
  } catch {
    $r = $_.Exception.Response
    $code = [int]$r.StatusCode
    $sr = New-Object IO.StreamReader($r.GetResponseStream())
    $txt = $sr.ReadToEnd()
    Write-Host "$slug -> HTTP $code $txt"
  }
}

Probe 'livreur-apply' @{ full_name='Test'; city='Conakry'; vehicle_type='moto'; answers=@{ zones='Kaloum'; availability='soir'; has_license_insurance=$true; accepts_qr_process=$true; accepts_linky_terms=$true } }
Probe 'livreur-application-status' @{}
Probe 'admin-list-livreur-applications' @{ status='pending' }
Probe 'admin-decide-livreur-application' @{ application_id='00000000-0000-0000-0000-000000000000'; decision='approve' }
