# Phase Y.1 — probe DB for mojibake / non-ASCII bytes across user-visible text
# columns. Read-only; reports findings so we know what the migration must clean.
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

Write-Host '=== 1. shops.response_time_text  raw bytes ==='
$r = RunQuery @"
select id, name, response_time_text,
       octet_length(response_time_text) as bytes,
       (response_time_text ~ '^[\x20-\x7E]*$') as ascii_only
  from public.shops
 order by created_at;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== 2. shops.about / shops.city  non-ASCII ==='
$r = RunQuery @"
select id, name,
       (about ~ '^[\x20-\x7E]*$') as about_ascii,
       octet_length(about) as about_bytes,
       (city ~ '^[\x20-\x7E]*$') as city_ascii,
       city
  from public.shops
 order by created_at;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== 3. products.title / description  non-ASCII ==='
$r = RunQuery @"
select id, title,
       (title ~ '^[\x20-\x7E]*$') as title_ascii,
       (description ~ '^[\x20-\x7E]*$') as desc_ascii
  from public.products
 order by created_at
 limit 50;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== 4. properties.* text columns ==='
# Discover the text columns first, then check each one.
$cols = RunQuery @"
select column_name
  from information_schema.columns
 where table_schema='public' and table_name='properties'
   and data_type in ('text','character varying');
"@
$cols | ConvertTo-Json -Depth 3 | Write-Host

Write-Host ''
Write-Host '=== 5. Specifically look for the C3/E2 mojibake markers ==='
$r = RunQuery @"
select 'shops.response_time_text' as col,
       count(*) filter (where position(E'\xc3' in response_time_text) > 0) as has_c3,
       count(*) filter (where position(E'\xe2' in response_time_text) > 0) as has_e2
  from public.shops
union all
select 'shops.about',
       count(*) filter (where position(E'\xc3' in about) > 0),
       count(*) filter (where position(E'\xe2' in about) > 0)
  from public.shops
union all
select 'shops.name',
       count(*) filter (where position(E'\xc3' in name) > 0),
       count(*) filter (where position(E'\xe2' in name) > 0)
  from public.shops
union all
select 'shops.city',
       count(*) filter (where position(E'\xc3' in city) > 0),
       count(*) filter (where position(E'\xe2' in city) > 0)
  from public.shops
union all
select 'products.title',
       count(*) filter (where position(E'\xc3' in title) > 0),
       count(*) filter (where position(E'\xe2' in title) > 0)
  from public.products
union all
select 'products.description',
       count(*) filter (where position(E'\xc3' in description) > 0),
       count(*) filter (where position(E'\xe2' in description) > 0)
  from public.products;
"@
$r | ConvertTo-Json -Depth 5 | Write-Host
