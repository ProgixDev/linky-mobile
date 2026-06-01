-- Phase I.3 - Rail path in place_order + cron worker RPCs (poll, transition, expire).
-- One-sided escrow credit (Option I.3.X) for the rail success transition; matches
-- confirm_topup precedent. Option Z (double-entry retrofit) is deferred to a
-- standalone ledger-cleanup phase post-V1.

-- M3: explicit ON DELETE RESTRICT on the FK (default NO ACTION is semantically
-- equivalent for non-deferred FKs; making it explicit for documentation).
-- A (idempotent): drop constraint if exists so re-applying this migration in
-- dev iteration won't fail.
alter table public.payment_intents
  drop constraint if exists payment_intents_order_id_fkey;
alter table public.payment_intents
  add constraint payment_intents_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete restrict;

-- ===========================================================================
-- place_order: rail branch (status='placed', no fund movement). Wallet branch
-- unchanged from H2. Card method still rejected (Phase I' Stripe takes cards).
-- ===========================================================================
create or replace function public.place_order(
  p_buyer_id       uuid,
  p_product_id     uuid,
  p_quantity       integer,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_product           record;
  v_seller_id         uuid;
  v_amount_minor      bigint;
  v_fees_minor        bigint;
  v_total_minor       bigint;
  v_order_id          uuid;
  v_reference         text;
  v_now               timestamptz := now();
  v_buyer_wallet_id   uuid;
  v_escrow_wallet_id  uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  -- Cards deferred to Phase I' (Stripe). Q5 lock.
  if p_payment_method = 'card' then
    raise exception 'PAYMENT_METHOD_NOT_SUPPORTED';
  end if;

  select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, s.owner_id
    into v_product
    from public.products p
    join public.shops s on s.id = p.shop_id
    where p.id = p_product_id
    for update of p;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

  v_seller_id := v_product.owner_id;
  if v_seller_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;

  v_amount_minor := v_product.price_minor * p_quantity;
  v_fees_minor   := round(v_amount_minor * 0.03);
  v_total_minor  := v_amount_minor + v_fees_minor;
  v_reference    := public.generate_order_reference();

  if p_payment_method = 'wallet' then
    -- WALLET BRANCH (unchanged from H2): atomic buyer->escrow transfer.
    insert into public.wallets (user_id, currency)
      values (p_buyer_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_buyer_wallet_id
      from public.wallets
      where user_id = p_buyer_id and currency = 'GNF';

    select id into v_escrow_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      payment_method, status, events
    ) values (
      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,
      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),
      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,
      p_payment_method,
      'paid',
      jsonb_build_array(
        jsonb_build_object('at', v_now, 'label', 'Commande passée'),
        jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
      )
    )
    returning id into v_order_id;

    perform public.post_transfer(
      v_buyer_wallet_id, v_escrow_wallet_id, v_total_minor,
      'order_escrow', v_order_id
    );
  else
    -- RAIL BRANCH (NEW): insert at 'placed', no fund movement. The
    -- cron-poll-intents worker flips to 'paid' + credits escrow on rail success.
    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      payment_method, status, events
    ) values (
      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,
      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),
      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,
      p_payment_method,
      'placed',
      jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))
    )
    returning id into v_order_id;
  end if;

  return v_order_id;
end;
$$;

-- ===========================================================================
-- pick_intents_to_poll: backoff-aware selection of pending intents.
-- Q2 backoff schedule: 5s / 15s / 30s across age bands.
-- ===========================================================================
create or replace function public.pick_intents_to_poll(p_limit int default 200)
returns setof public.payment_intents
language sql
security definer
set search_path to ''
as $$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.created_at > now() - interval '15 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '15 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$$;

-- ===========================================================================
-- process_intent_outcome: atomic terminal-state transition for an intent.
-- ===========================================================================
create or replace function public.process_intent_outcome(
  p_intent_id        uuid,
  p_terminal_status  text,
  p_rail_status      text,
  p_error_code       text,
  p_error_message    text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_intent           record;
  v_order            record;
  v_escrow_wallet_id uuid;
  v_escrow_balance   bigint;
  v_now              timestamptz := now();
begin
  if p_terminal_status not in ('completed','failed','cancelled') then
    raise exception 'INVALID_TERMINAL_STATUS';
  end if;

  select * into v_intent from public.payment_intents
    where id = p_intent_id for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;

  -- M2: idempotency no-op with visible NOTICE for debugging.
  if v_intent.status <> 'pending' then
    raise notice 'process_intent_outcome: intent % already %, skipping',
      p_intent_id, v_intent.status;
    return;
  end if;

  select * into v_order from public.orders
    where id = v_intent.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_terminal_status = 'completed' then
    -- M4: escrow wallet was created in 20260531_03_h2_escrow_setup.sql. If
    -- missing, something is structurally wrong - raise rather than auto-create
    -- (auto-create would mask a real config issue).
    select id into v_escrow_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000001' and currency = v_order.currency
      for update;
    if v_escrow_wallet_id is null then raise exception 'ESCROW_WALLET_NOT_FOUND'; end if;

    -- I.3.X one-sided credit: rail debited buyer's MoMo outside our ledger;
    -- we credit escrow_gnf directly. Mirrors confirm_topup's COALESCE+INSERT.
    v_escrow_balance := coalesce(
      (select balance_after from public.ledger_entries
         where wallet_id = v_escrow_wallet_id
         order by created_at desc, id desc limit 1), 0);

    insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
      values (v_escrow_wallet_id, 'credit', v_order.total_minor,
              v_escrow_balance + v_order.total_minor, 'order_escrow', v_order.id);

    update public.orders
      set status = 'paid',
          events = v_order.events || jsonb_build_array(
                     jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
                   ),
          updated_at = v_now
      where id = v_order.id;
  else
    -- 'failed' or 'cancelled' - no fund movement.
    update public.orders
      set status = 'cancelled',
          events = v_order.events || jsonb_build_array(
                     jsonb_build_object(
                       'at', v_now,
                       'label', case p_terminal_status
                         when 'failed'    then 'Paiement échoué'
                         when 'cancelled' then 'Paiement annulé'
                       end,
                       'error_code', p_error_code,
                       'error_message', p_error_message
                     )
                   ),
          updated_at = v_now
      where id = v_order.id;
  end if;

  update public.payment_intents
    set status             = p_terminal_status,
        rail_status        = p_rail_status,
        last_error_code    = p_error_code,
        last_error_message = p_error_message,
        completed_at       = v_now,
        updated_at         = v_now
    where id = p_intent_id;
end;
$$;

-- ===========================================================================
-- bump_intent_poll (M1): atomic poll-tick bookkeeping.
-- ===========================================================================
create or replace function public.bump_intent_poll(
  p_intent_id      uuid,
  p_rail_status    text,
  p_error_code     text,
  p_error_message  text
)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.payment_intents
  set attempts_count     = attempts_count + 1,
      last_polled_at     = now(),
      last_error_code    = p_error_code,
      last_error_message = p_error_message,
      rail_status        = p_rail_status,
      updated_at         = now()
  where id = p_intent_id and status = 'pending';
$$;

-- ===========================================================================
-- expire_stale_intents: 15-min TTL sweep, S5 less-eager logic.
-- Only expires intents whose LAST poll was a clean 'pending' from rail
-- (last_error_code IS NULL). Intents with a recent transient error are
-- left pending - rail-side debit may have succeeded; auto-cancelling could
-- orphan settlement.
-- ===========================================================================
create or replace function public.expire_stale_intents()
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, order_id from public.payment_intents
    where status = 'pending'
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired',
          completed_at = v_now,
          updated_at = v_now
      where id = v_intent.id;

    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(
                     jsonb_build_object('at', v_now, 'label', 'Paiement expiré')
                   ),
          updated_at = v_now
      where id = v_intent.order_id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ===========================================================================
-- S1: tight permissions on the 4 new RPCs. Service-role-only.
-- Mirrors confirm_topup's pattern.
-- ===========================================================================
revoke all on function public.pick_intents_to_poll(int) from public, anon, authenticated;
grant execute on function public.pick_intents_to_poll(int) to service_role;

revoke all on function public.process_intent_outcome(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.process_intent_outcome(uuid, text, text, text, text) to service_role;

revoke all on function public.bump_intent_poll(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bump_intent_poll(uuid, text, text, text) to service_role;

revoke all on function public.expire_stale_intents() from public, anon, authenticated;
grant execute on function public.expire_stale_intents() to service_role;
