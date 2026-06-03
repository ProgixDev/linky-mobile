create or replace function public.send_message(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_body text,
  p_pinned_kind text default null,
  p_pinned_id uuid default null
) returns table (
  message_id uuid,
  conversation_id uuid,
  is_new_conversation boolean
) language plpgsql security definer set search_path = '' as $$
declare
  v_a uuid;
  v_b uuid;
  v_sender_is_a boolean;
  v_conversation_id uuid;
  v_message_id uuid;
  v_is_new boolean := false;
begin
  -- Guards
  if p_sender_id = p_recipient_id then
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

  -- Canonical sort: a < b lexicographically (matches table CHECK participants_sorted)
  if p_sender_id < p_recipient_id then
    v_a := p_sender_id;
    v_b := p_recipient_id;
    v_sender_is_a := true;
  else
    v_a := p_recipient_id;
    v_b := p_sender_id;
    v_sender_is_a := false;
  end if;

  -- Advisory xact lock keyed by canonical conv key — serializes concurrent
  -- "first message" attempts on the same (pair, pinned) without ON CONFLICT
  -- inference issues from the COALESCE-based unique index.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_a::text || '|' || v_b::text || '|' || coalesce(p_pinned_kind, '') || '|' || coalesce(p_pinned_id::text, ''),
      0
    )
  );

  -- Find or create conversation
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

  -- Insert message
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conversation_id, p_sender_id, p_body)
  returning id into v_message_id;

  -- Update conversation metadata + increment recipient's unread counter
  update public.conversations
  set last_message_text = p_body,
      last_message_at = now(),
      last_message_sender_id = p_sender_id,
      unread_a = case when v_sender_is_a then unread_a else unread_a + 1 end,
      unread_b = case when v_sender_is_a then unread_b + 1 else unread_b end,
      updated_at = now()
  where id = v_conversation_id;

  return query select v_message_id, v_conversation_id, v_is_new;
end;
$$;

revoke all on function public.send_message(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.send_message(uuid, uuid, text, text, uuid) to service_role;
