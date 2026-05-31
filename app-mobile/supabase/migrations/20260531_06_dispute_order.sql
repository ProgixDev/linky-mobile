-- H2 Step D — dispute_order: buyer flags a paid/delivered order as disputed.
-- Verifies caller is buyer + status in ('paid','delivered'), validates reason
-- in the RPC too (defense in depth — endpoint validator catches first). Sets
-- status='disputed' and appends a 'Litige ouvert' event with reason + optional
-- note. No fund movement; funds stay in escrow until admin resolution (Phase K).

create or replace function public.dispute_order(
  p_order_id  uuid,
  p_caller_id uuid,
  p_reason    text,
  p_note      text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order record;
  v_now   timestamptz := now();
  v_event jsonb;
begin
  if p_reason not in ('damaged', 'wrong', 'not_received') then
    raise exception 'INVALID_REASON';
  end if;

  select id, buyer_id, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;

  if v_order.status not in ('paid', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  v_event := jsonb_build_object(
    'at',     v_now,
    'label',  'Litige ouvert',
    'reason', p_reason,
    'note',   nullif(p_note, '')
  );

  update public.orders
    set status = 'disputed',
        events = v_order.events || jsonb_build_array(v_event),
        updated_at = v_now
    where id = v_order.id;
end;
$$;
