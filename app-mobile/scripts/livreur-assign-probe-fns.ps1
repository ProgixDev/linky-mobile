# Garbage-bearer probe for the 3 dispatch fns — healthy = our JSON
# UNAUTHORIZED (verify_jwt off, our auth runs).
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
function EnvVal($key) {
  (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
}
$anon = EnvVal 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
$url  = EnvVal 'EXPO_PUBLIC_SUPABASE_URL'
function Probe($slug, $body) {
  $headers = @{ apikey = $anon; Authorization = 'Bearer garbage.token.value'; 'idempotency-key' = [guid]::NewGuid().ToString(); 'content-type' = 'application/json' }
  try {
    $resp = Invoke-WebRequest -Uri "$url/functions/v1/$slug" -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Compress) -UseBasicParsing
    Write-Host "$slug -> HTTP $($resp.StatusCode) $($resp.Content)"
  } catch {
    $r = $_.Exception.Response; $code = [int]$r.StatusCode
    $txt = (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd()
    Write-Host "$slug -> HTTP $code $txt"
  }
}
Probe 'admin-list-deliveries' @{ status='unassigned' }
Probe 'admin-list-livreurs' @{}
Probe 'admin-assign-delivery' @{ delivery_id='00000000-0000-0000-0000-000000000000'; livreur_id='00000000-0000-0000-0000-000000000000' }
