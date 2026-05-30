-- Block F.F — Atomic view_count increment for both products and properties. Single
-- PL/pgSQL function so the edge function doesn't have to branch on kind in JS.
-- p_kind is text (not a checked enum) so the function is forward-compatible if we
-- add more catalog kinds later; unknown kinds silently no-op.

create or replace function public.increment_view_count(
  p_kind text,
  p_id   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'product' then
    update public.products set view_count = view_count + 1 where id = p_id;
  elsif p_kind = 'property' then
    update public.properties set view_count = view_count + 1 where id = p_id;
  end if;
end;
$$;

revoke all on function public.increment_view_count(text, uuid) from public, anon, authenticated;
grant execute on function public.increment_view_count(text, uuid) to service_role;
