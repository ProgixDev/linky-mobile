# Deploy a single Supabase Edge Function via the Management API multipart endpoint.
# PS 5.1 has no Invoke-RestMethod -Form, so we build the request with System.Net.Http.
# Bundles: <slug>/index.ts (entrypoint) + deno.json (import map) + all _shared/*.ts,
# flattened to root so the "@shared/" -> "./_shared/" alias in deno.json resolves.
# Usage:  & .\scripts\deploy-edge.ps1 -Slug otp-request [-VerifyJwt $false]
param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [bool]$VerifyJwt = $false
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root      = Split-Path -Parent $PSScriptRoot         # scripts/ -> app-mobile
$fnDir     = Join-Path $root "supabase\functions\$Slug"
$sharedDir = Join-Path $root "supabase\functions\_shared"
$denoJson  = Join-Path $root "supabase\functions\deno.json"
$entry     = Join-Path $fnDir "index.ts"
if (-not (Test-Path $entry))    { throw "entrypoint not found: $entry" }
if (-not (Test-Path $denoJson)) { throw "deno.json not found: $denoJson" }

$ref = 'fvvqgcsphwrmdlclnxcz'
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw "SUPABASE_ACCESS_TOKEN not found in .env" }

Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(120)
$form = New-Object System.Net.Http.MultipartFormDataContent

$meta = @{ entrypoint_path = 'index.ts'; import_map_path = 'deno.json'; name = $Slug; verify_jwt = $VerifyJwt } | ConvertTo-Json -Compress
$form.Add((New-Object System.Net.Http.StringContent($meta, [System.Text.Encoding]::UTF8, "application/json")), "metadata")

function Add-FilePart($form, $path, $relname, $ctype) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $fc = New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $bytes)
  $fc.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($ctype)
  $form.Add($fc, "file", $relname)
}

Add-FilePart $form $entry "index.ts" "application/typescript"
Add-FilePart $form $denoJson "deno.json" "application/json"
Get-ChildItem -Path $sharedDir -Filter *.ts | ForEach-Object {
  Add-FilePart $form $_.FullName ("_shared/" + $_.Name) "application/typescript"
}

$uri = "https://api.supabase.com/v1/projects/$ref/functions/deploy?slug=$Slug"
$reqMsg = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $uri)
$reqMsg.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $pat)
$reqMsg.Content = $form
$resp = $client.SendAsync($reqMsg).Result
$code = [int]$resp.StatusCode
$body = $resp.Content.ReadAsStringAsync().Result
$client.Dispose()

"HTTP $code"
if ($code -ge 200 -and $code -lt 300) {
  $j = $body | ConvertFrom-Json
  "deployed: slug=$($j.slug) version=$($j.version) status=$($j.status) verify_jwt=$($j.verify_jwt) import_map=$($j.import_map)"
} else {
  "DEPLOY FAILED: $body"
}
