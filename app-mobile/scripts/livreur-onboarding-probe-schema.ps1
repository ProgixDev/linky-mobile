# One-off schema introspection for the livreur-onboarding phase.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pat = (((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*SUPABASE_ACCESS_TOKEN\s*=' } | Select-Object -First 1) -split '=', 2)[1]).Trim().Trim('"')
$ref = 'fvvqgcsphwrmdlclnxcz'
$queryUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
$headers = @{ Authorization = "Bearer $pat" }
function RunQuery($q) {
  $body = ConvertTo-Json @{ query = $q } -Depth 3 -Compress
  Invoke-RestMethod -Uri $queryUrl -Method Post -Headers $headers -Body $body -ContentType 'application/json'
}
Write-Host '=== users columns ==='
RunQuery "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='users' order by ordinal_position;" | ConvertTo-Json -Depth 5
Write-Host '=== admin_actions columns ==='
RunQuery "select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='admin_actions' order by ordinal_position;" | ConvertTo-Json -Depth 5
Write-Host '=== email storage (emails table?) ==='
RunQuery "select table_name from information_schema.tables where table_schema='public' and table_name in ('emails','user_emails');" | ConvertTo-Json -Depth 5
Write-Host '=== livreur_applications exists? ==='
RunQuery "select to_regclass('public.livreur_applications') as tbl;" | ConvertTo-Json -Depth 5
Write-Host '=== uuidv7 helper exists? ==='
RunQuery "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='uuidv7';" | ConvertTo-Json -Depth 5
Write-Host '=== livreur count + deliveries status breakdown ==='
RunQuery "select (select count(*) from public.users where 'livreur'=any(roles)) as livreurs, (select json_agg(t) from (select status, count(*) from public.deliveries group by status) t) as deliveries;" | ConvertTo-Json -Depth 5
