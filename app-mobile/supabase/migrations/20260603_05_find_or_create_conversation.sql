create or replace function public.find_or_create_conversation(
  p_user_id uuid,
  p_recipient_id uuid,
  p_pinned_kind text default null,
  p_pinned_id uuid default null
) returns table (
  conversation_id uuid,
  is_new_conversation boolean
) language plpgsql security definer set search_path = '' as $$
declare
  v_a uuid;
  v_b uuid;
  v_conversation_id uuid;
  v_is_new boolean := false;
begin
  -- Guards (same as send_message)
  if p_user_id = p_recipient_id then
    raise exception 'cannot_message_self' using errcode = '22023';
  end if;
  if (p_pinned_kind is null) <> (p_pinned_id is null) then
    raise exception 'invalid_pinned_pair' using errcode = '22023';
  end if;
  if p_pinned_kind is not null and p_pinned_kind not in ('product', 'property') then
    raise exception 'invalid_pinned_kind' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_recipient_id) then
    raise exception 'recipient_not_found' using errcode = 'P0002';
  end if;
  if p_pinned_kind = 'product' and not exists (select 1 from public.products where id = p_pinned_id) then
    raise exception 'pinned_product_not_found' using errcode = 'P0002';
  end if;
  if p_pinned_kind = 'property' and not exists (select 1 from public.properties where id = p_pinned_id) then
    raise exception 'pinned_property_not_found' using errcode = 'P0002';
  end if;

  -- Canonical sort (matches participants_sorted CHECK)
  if p_user_id < p_recipient_id then
    v_a := p_user_id;
    v_b := p_recipient_id;
  else
    v_a := p_recipient_id;
    v_b := p_user_id;
  end if;

  -- Advisory xact lock (same pattern as send_message)
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_a::text || '|' || v_b::text || '|' || coalesce(p_pinned_kind, '') || '|' || coalesce(p_pinned_id::text, ''),
      0
    )
  );

  -- Find or create
  select id into v_conversation_id
  from public.conversations
  where participant_a_id = v_a
    and participant_b_id = v_b
    and pinned_kind is not distinct from p_pinned_kind
    and pinned_id is not distinct from p_pinned_id;

  if v_conversation_id is null then
    insert into public.conversations (participant_a_id, participant_b_id, pinned_kind, pinned_id)
    values (v_a, v_b, p_pinned_kind, p_pinned_id)
    returning id into v_conversation_id;
    v_is_new := true;
  end if;

  return query select v_conversation_id, v_is_new;
end;
$$;

revoke all on function public.find_or_create_conversation(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.find_or_create_conversation(uuid, uuid, text, uuid) to service_role;
