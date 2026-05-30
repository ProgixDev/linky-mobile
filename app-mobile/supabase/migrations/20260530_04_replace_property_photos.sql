-- Block E.2.fix2 — Atomic property_photos replacement. property-update previously
-- did a delete-then-insert in JS which left a brief window where a property could
-- have zero photos if the insert failed. This RPC wraps both operations in a single
-- PL/pgSQL transaction so a partial failure rolls back to the prior photo set.
-- Same security definer + search_path='' pattern as create_property_with_photos.

create or replace function public.replace_property_photos(
  p_property_id uuid,
  p_photos     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.property_photos where property_id = p_property_id;
  insert into public.property_photos (property_id, url, storage_path, position)
  select p_property_id,
         (e ->> 'url')::text,
         (e ->> 'storage_path')::text,
         (e ->> 'position')::int
  from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) e
  order by (e ->> 'position')::int;
end;
$$;

revoke all on function public.replace_property_photos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_property_photos(uuid, jsonb) to service_role;
