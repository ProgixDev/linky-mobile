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
Write-Host '=== emails columns ==='
RunQuery "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='emails' order by ordinal_position;" | ConvertTo-Json -Depth 5
Write-Host '=== phones columns ==='
RunQuery "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='phones' order by ordinal_position;" | ConvertTo-Json -Depth 5
Write-Host '=== orders columns (for admin-list-deliveries) ==='
RunQuery "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='orders' order by ordinal_position;" | ConvertTo-Json -Depth 5
