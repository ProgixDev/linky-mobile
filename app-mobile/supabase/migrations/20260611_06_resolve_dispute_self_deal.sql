-- Phase V.4 — self-deal assertion in resolve_dispute.
--
-- Audit fact (2026-06-10) : the RPC never verified that p_admin_id is not
-- the buyer or seller of the order. With V1's single admin self-reporting,
-- nothing prevents that admin from ruling on their own dispute. No
-- exploit observed, but the door is structurally open and was flagged
-- during hand-test K.3 on LK-2026-10027.
--
-- Fix : after the admin guard and outcome validation, before the row lock,
-- compare p_admin_id against orders.buyer_id / seller_id. If either
-- matches, raise 'self_deal_forbidden' (P0001 — application-defined).
-- The edge fn maps to FORBIDDEN_SELF_DEAL 400.
--
-- The replacement function preserves every other line verbatim. We use
-- a stable DROP-and-CREATE to keep the function OID consistent for
-- existing GRANTs ; the trailing revoke/grant re-binds permissions
-- defensively.

create or replace function public.resolve_dispute(
  p_order_id  uuid,
  p_admin_id  uuid,
  p_outcome   text,
  p_reason    text default null,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order               record;
  v_before              jsonb;
  v_after               jsonb;
  v_new_status          text;
  v_buyer_wallet_id     uuid;
  v_seller_wallet_id    uuid;
  v_escrow_wallet_id    uuid;
  v_platform_wallet_id  uuid;
  v_event               jsonb;
  v_now                 timestamptz := now();
  v_buyer_id            uuid;
  v_seller_id           uuid;
begin
  -- Guard: admin?
  perform public.assert_admin(p_admin_id);

  -- Guard: outcome valid?
  if p_outcome not in ('refund', 'release') then
    raise exception 'invalid_outcome'
      using errcode = '22023', detail = 'expected refund or release';
  end if;

  -- Phase V.4 — self-deal guard. Cheap pre-read so we can fail fast
  -- BEFORE locking the order row (locks held across a self-deal abort
  -- would still complete the assertion, but a no-lock fast-fail is
  -- friendlier to concurrent legitimate resolutions).
  select buyer_id, seller_id into v_buyer_id, v_seller_id
    from public.orders
    where id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_admin_id = v_buyer_id or p_admin_id = v_seller_id then
    raise exception 'self_deal_forbidden' using errcode = 'P0001';
  end if;

  -- Lock the order
  select id, buyer_id, seller_id, amount_minor, fees_minor, total_minor, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status <> 'disputed' then
    raise exception 'invalid_status'
      using errcode = '22023', detail = 'order must be in disputed status, got ' || v_order.status;
  end if;

  -- Snapshot avant mutation (full row so audit replays bit-for-bit).
  select to_jsonb(o.*) into v_before
    from public.orders o
    where o.id = p_order_id;

  -- Resolve wallet ids common to both branches.
  select id into v_escrow_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  if p_outcome = 'refund' then
    v_new_status := 'refunded';

    insert into public.wallets (user_id, currency)
      values (v_order.buyer_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_buyer_wallet_id
      from public.wallets
      where user_id = v_order.buyer_id and currency = 'GNF';

    perform public.post_transfer(
      v_escrow_wallet_id, v_buyer_wallet_id, v_order.amount_minor,
      'order_refund', v_order.id
    );
    perform public.post_transfer(
      v_escrow_wallet_id, v_buyer_wallet_id, v_order.fees_minor,
      'order_fee_refund', v_order.id
    );

  else
    v_new_status := 'released';

    insert into public.wallets (user_id, currency)
      values (v_order.seller_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_seller_wallet_id
      from public.wallets
      where user_id = v_order.seller_id and currency = 'GNF';

    select id into v_platform_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

    perform public.post_transfer(
      v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
      'order_release', v_order.id
    );
    perform public.post_transfer(
      v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor,
      'order_platform_fee', v_order.id
    );
  end if;

  v_event := jsonb_build_object(
    'at',       v_now,
    'label',    'Litige résolu',
    'kind',     'dispute_resolved',
    'outcome',  p_outcome,
    'admin_id', p_admin_id,
    'reason',   nullif(p_reason, ''),
    'note',     nullif(p_note, '')
  );

  update public.orders
    set status = v_new_status,
        events = v_order.events || jsonb_build_array(v_event),
        updated_at = v_now
    where id = v_order.id;

  select to_jsonb(o.*) into v_after
    from public.orders o
    where o.id = p_order_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id,
    'order',
    p_order_id,
    'dispute.resolve',
    nullif(p_reason, ''),
    jsonb_build_object('outcome', p_outcome, 'note', nullif(p_note, '')),
    v_before,
    v_after
  );
end;
$$;

revoke all on function public.resolve_dispute(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_dispute(uuid, uuid, text, text, text)
  to service_role;
