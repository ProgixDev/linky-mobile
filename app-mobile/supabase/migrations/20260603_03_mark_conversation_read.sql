create or replace function public.mark_conversation_read(
  p_user_id uuid,
  p_conversation_id uuid
) returns table (
  marked_count integer
) language plpgsql security definer set search_path = '' as $$
declare
  v_a uuid;
  v_b uuid;
  v_user_is_a boolean;
  v_marked_count integer;
begin
  -- Lock the conversation row to serialize concurrent mark_read calls and
  -- prevent races with send_message updating the unread counters.
  select participant_a_id, participant_b_id
  into v_a, v_b
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  -- Authorize: caller must be a participant.
  if p_user_id = v_a then
    v_user_is_a := true;
  elsif p_user_id = v_b then
    v_user_is_a := false;
  else
    raise exception 'not_a_participant' using errcode = '42501';
  end if;

  -- Mark all unread incoming messages as read. Idempotent: second call returns
  -- 0 because read_at is no longer null on the same rows.
  with marked as (
    update public.messages
    set read_at = now()
    where conversation_id = p_conversation_id
      and sender_id <> p_user_id
      and read_at is null
    returning id
  )
  select count(*)::integer into v_marked_count from marked;

  -- Reset the caller's side unread counter (the other side keeps theirs).
  if v_user_is_a then
    update public.conversations
    set unread_a = 0, updated_at = now()
    where id = p_conversation_id;
  else
    update public.conversations
    set unread_b = 0, updated_at = now()
    where id = p_conversation_id;
  end if;

  return query select v_marked_count;
end;
$$;

revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to service_role;
