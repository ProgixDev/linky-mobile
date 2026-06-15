# Phase Y.1 — dump exact UTF-8 bytes of shops.response_time_text to confirm
# what mojibake we're dealing with. Read-only.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }

function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3
  return Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}

Write-Host '=== shops.response_time_text  hex bytes ==='
$r = RunQuery @"
select id,
       octet_length(response_time_text) as bytes,
       encode(convert_to(response_time_text, 'UTF8'), 'hex') as hex,
       length(response_time_text) as chars
  from public.shops
 order by created_at;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== products.description  sample hex (first 64 bytes) ==='
$r = RunQuery @"
select id, title,
       octet_length(description) as bytes,
       encode(substring(convert_to(description, 'UTF8') from 1 for 64), 'hex') as hex_head
  from public.products
 order by created_at
 limit 10;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== shops.name hex (to confirm Ma boutique is clean) ==='
$r = RunQuery @"
select id, name,
       encode(convert_to(name, 'UTF8'), 'hex') as hex
  from public.shops
 limit 4;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host
