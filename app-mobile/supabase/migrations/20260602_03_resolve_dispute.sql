-- =====================================================================
-- Phase K.2 — Admin dispute resolution.
-- =====================================================================
-- Two pieces:
--
-- assert_admin(p_user_id):
--   Reusable guard. Raises 'not_admin' (42501) for non-admins, 'user_not_found'
--   (P0002) for unknown ids. Called from any RPC that needs the binary admin
--   gate (Q1). Kept its own function so future admin RPCs in K.* don't each
--   re-implement the same select.
--
-- resolve_dispute(p_order_id, p_admin_id, p_outcome, p_reason, p_note):
--   Binary verdict on a disputed order (Q2: refund OR release, no partial).
--   Q6 anchor: only called from an admin endpoint with a human in the loop —
--   nothing in V1 invokes this asynchronously.
--   Ledger shape mirrors the existing flows verbatim:
--     release → reuse confirm_order_receipt's pair (order_release + order_platform_fee).
--     refund  → escrow → buyer (order_refund) + escrow → buyer (order_fee_refund).
--   Per Q2 binary outcomes, refund returns total (amount + fees) — platform
--   doesn't keep its cut on a refunded order. Two paired transfers (instead
--   of one combined total) keep the buyer's ledger history symmetric with the
--   release split: every fee credit has a fee debit somewhere.
--   Append-only audit (Q3): every call writes one admin_actions row with the
--   full before/after order snapshot. action follows the dotted-namespace
--   taxonomy (project_phase_k_admin_action_type_taxonomy memo) — 'dispute.resolve',
--   not 'resolve_dispute'. Outcome lives in metadata->>'outcome' so we can
--   query "all dispute.* actions" without LIKE pattern and aggregate
--   resolve actions across domains later.
--   Event shape extends the existing {at, label} pair with kind/outcome/
--   admin_id/reason/note. label stays so existing UI readers (mapOrder events
--   list) don't break. admin_id MUST be stripped by mapOrder for non-admin
--   callers when K.3 lands (memo project_phase_k_mapper_pii).
--
-- Permissions: both functions are revoked from public/anon/authenticated and
-- granted to service_role only. Edge functions in K.3 will call these via the
-- service role key; clients never call them directly.

create or replace function public.assert_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin
  from public.users
  where id = p_user_id;

  if v_is_admin is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if not v_is_admin then
    raise exception 'not_admin' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_admin(uuid) from public, anon, authenticated;
grant execute on function public.assert_admin(uuid) to service_role;


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
begin
  -- Guard: admin?
  perform public.assert_admin(p_admin_id);

  -- Guard: outcome valid?
  if p_outcome not in ('refund', 'release') then
    raise exception 'invalid_outcome'
      using errcode = '22023', detail = 'expected refund or release';
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

    -- Buyer wallet is guaranteed (they paid into escrow from it) but auto-create
    -- defensively so a wallet-deletion or future flow can't break the refund.
    insert into public.wallets (user_id, currency)
      values (v_order.buyer_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_buyer_wallet_id
      from public.wallets
      where user_id = v_order.buyer_id and currency = 'GNF';

    -- Two paired transfers (mirrors release split): amount + fees both go back
    -- to the buyer. Platform retains nothing on a refund per Q2 binary.
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

    -- Seller wallet auto-create — same defensive pattern as confirm_order_receipt
    -- so a fresh seller (or a deleted wallet) doesn't block the release.
    insert into public.wallets (user_id, currency)
      values (v_order.seller_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_seller_wallet_id
      from public.wallets
      where user_id = v_order.seller_id and currency = 'GNF';

    select id into v_platform_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

    -- Reuse confirm_order_receipt's exact ref_type pair so ledger reads (and
    -- accounting reports) don't need to special-case dispute-resolved releases
    -- vs buyer-confirmed releases. The event log distinguishes them.
    perform public.post_transfer(
      v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
      'order_release', v_order.id
    );
    perform public.post_transfer(
      v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor,
      'order_platform_fee', v_order.id
    );
  end if;

  -- Event shape: keep label for backward-compat with mapOrder consumers; the
  -- extended fields (kind/outcome/admin_id/reason/note) drive the admin UI
  -- timeline and feed the PII-strip in mapOrder for non-admin callers (K.3).
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

  -- After-snapshot — re-read instead of constructing in memory so it reflects
  -- any triggers / generated columns that fired on the UPDATE above.
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
