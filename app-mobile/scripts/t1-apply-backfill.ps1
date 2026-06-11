# Phase T.1 follow-up — apply 20260611_04_roles_backfill.sql + verify.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migrationName = '20260611_04_roles_backfill'
$migrationPath = Join-Path $root "supabase\migrations\$migrationName.sql"
$sql = [System.IO.File]::ReadAllText($migrationPath, [System.Text.UTF8Encoding]::new($false))

$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }

function RunQuery($sqlText) {
  $body = ConvertTo-Json @{ query = $sqlText } -Depth 3
  return Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}

Write-Host '=== BEFORE (per-role counts) ==='
$before = RunQuery @"
select
  count(*) filter (where roles @> array['buyer']::text[])  as buyer_count,
  count(*) filter (where roles @> array['seller']::text[]) as seller_count,
  count(*) filter (where roles @> array['agent']::text[])  as agent_count,
  count(*) as total_users
from public.users
where id not in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);
"@
$before | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== APPLY BACKFILL ==='
RunQuery $sql | Out-Null
Write-Host '  query endpoint: SUCCESS'

Write-Host ''
Write-Host '=== AFTER (per-role counts) ==='
$after = RunQuery @"
select
  count(*) filter (where roles @> array['buyer']::text[])  as buyer_count,
  count(*) filter (where roles @> array['seller']::text[]) as seller_count,
  count(*) filter (where roles @> array['agent']::text[])  as agent_count,
  count(*) as total_users
from public.users
where id not in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);
"@
$after | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Sanity (publish-eligible cross-check) ==='
$sanity = RunQuery @"
select
  (select count(distinct s.owner_id)
     from public.shops s
     join public.products p on p.shop_id = s.id)               as users_with_products,
  (select count(distinct u.id)
     from public.users u
    where u.roles @> array['seller']::text[])                  as users_tagged_seller,
  (select count(distinct pr.owner_id) from public.properties pr) as users_with_properties,
  (select count(distinct u.id)
     from public.users u
    where u.roles @> array['agent']::text[])                   as users_tagged_agent;
"@
$sanity | ConvertTo-Json -Depth 5 | Write-Host
