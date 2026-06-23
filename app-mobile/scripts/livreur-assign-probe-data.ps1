$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3 -Compress
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers @{ Authorization = "Bearer $pat" } -Body $body -ContentType 'application/json'
}
Write-Host '=== order status distribution (joined to deliveries) ==='
RunQuery "select o.status, count(*) from public.deliveries d join public.orders o on o.id=d.order_id group by o.status order by 2 desc;" | ConvertTo-Json -Depth 5
Write-Host '=== sample unassigned deliveries with order info ==='
RunQuery "select d.id as delivery_id, d.status as d_status, o.reference, o.status as o_status, (d.delivery_address->>'city') as city from public.deliveries d join public.orders o on o.id=d.order_id where d.status='unassigned' order by d.created_at desc limit 5;" | ConvertTo-Json -Depth 6
Write-Host '=== assign_delivery seller gate confirm (source) ==='
RunQuery "select pg_get_functiondef('public.assign_delivery(uuid,uuid,uuid)'::regprocedure) ~ 'NOT_ORDER_SELLER' as seller_gated;" | ConvertTo-Json -Depth 5
Write-Host '=== delivery-assign edge fn: admin path? (n/a in DB) ==='
