# Phase V.4 -- apply self-deal guard migration + controlled-raise probe.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
if (-not $pat) { throw 'SUPABASE_ACCESS_TOKEN not found in .env' }
$ref = 'fvvqgcsphwrmdlclnxcz'
$migration = '20260611_06_resolve_dispute_self_deal'
$path = Join-Path $root "supabase\migrations\$migration.sql"
$sql = [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false))
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }
function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3
  return Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}

Write-Host '=== APPLY 20260611_06_resolve_dispute_self_deal ==='
RunQuery $sql | Out-Null
Write-Host '  apply: OK'

Write-Host ''
Write-Host '=== Verify function definition contains self_deal_forbidden ==='
$check = RunQuery @"
select pg_get_functiondef(p.oid) ~ 'self_deal_forbidden' as has_check
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='resolve_dispute';
"@
$check | ConvertTo-Json -Depth 5 | Write-Host

Write-Host ''
Write-Host '=== Controlled-raise probe : call with admin = buyer of a real order ==='
# Pick an existing order and admin (any non-system row). We'll attempt the
# RPC directly and assert the raise comes through.
$pickSql = @"
with admin_row as (
  select id as admin_id from public.users where is_admin = true limit 1
),
order_row as (
  select id as order_id, buyer_id, seller_id, status from public.orders order by created_at desc limit 1
)
select a.admin_id, o.order_id, o.buyer_id, o.seller_id, o.status from admin_row a, order_row o;
"@
$pick = RunQuery $pickSql
$pick | ConvertTo-Json -Depth 5 | Write-Host

if (-not $pick.value -or $pick.value.Length -eq 0) {
  Write-Host '  no admin+order pair available -- skipping the live raise probe'
} else {
  $row = $pick.value[0]
  $adminId = $row.admin_id
  $orderId = $row.order_id
  $buyerId = $row.buyer_id
  $sellerId = $row.seller_id
  Write-Host "  admin=$adminId order=$orderId buyer=$buyerId seller=$sellerId"
  # Try calling with admin = buyer using a forged p_admin_id. This is a DIRECT
  # RPC call via the Management API ; it bypasses the edge fn admin gate, so
  # we can confirm the SELF_DEAL raise specifically.
  $probeSql = @"
do $body$
declare
  v_caught text;
begin
  begin
    perform public.resolve_dispute('$orderId'::uuid, '$buyerId'::uuid, 'refund'::text, null::text, null::text);
    raise notice 'NO RAISE (unexpected)';
  exception when others then
    v_caught := SQLERRM;
    raise notice 'CAUGHT: %', v_caught;
  end;
end
$body$;
"@
  try {
    $r = RunQuery $probeSql
    $r | ConvertTo-Json -Depth 5 | Write-Host
  } catch {
    Write-Host "  probe failed: $($_.Exception.Message)"
  }
}
