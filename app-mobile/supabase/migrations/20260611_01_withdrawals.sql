-- Phase S — seller withdrawals processing (admin marks paid / rejected).
--
-- 0.2 finding (FOLLOWED here) : wallet-withdraw-request does a READ-ONLY
-- balance check and inserts a pending row — NO hold / debit at request time.
-- So 'paid' debits the seller wallet AT PAYOUT TIME, re-checking the balance
-- under row lock, as the EXTERNAL EXIT mirror image of confirm_topup's
-- one-sided entry : the counterparty (the seller's mobile-money account) is
-- outside the system, so a single ledger debit with ref_type =
-- 'withdrawal_payout', ref_id = request id. V1 payout itself is MANUAL —
-- the admin sends the transfer outside the app, then calls this.
--
-- withdrawal_requests.status CHECK (20260529_02) already contains
-- 'paid' / 'rejected' — no CHECK change needed. Decision metadata columns
-- (decided_at / decided_by / reason) are new.

alter table public.withdrawal_requests
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references public.users(id),
  add column if not exists reason     text;

-- Work-queue hot path : pending oldest-first.
create index if not exists withdrawal_requests_pending_idx
  on public.withdrawal_requests (created_at)
  where status = 'pending';

-- ===========================================================================
-- process_withdrawal : admin terminal decision on a pending request.
-- Style mirrors resolve_dispute : assert_admin guard, row lock, lowercase
-- raises with errcodes, full before/after snapshots into admin_actions
-- (action taxonomy : 'withdrawal.paid' / 'withdrawal.rejected').
-- ===========================================================================
create or replace function public.process_withdrawal(
  p_request_id uuid,
  p_admin_id   uuid,
  p_outcome    text,
  p_reason     text default null
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_req       record;
  v_before    jsonb;
  v_after     jsonb;
  v_wallet_id uuid;
  v_balance   bigint;
  v_now       timestamptz := now();
begin
  perform public.assert_admin(p_admin_id);

  if p_outcome not in ('paid', 'rejected') then
    raise exception 'invalid_outcome'
      using errcode = '22023', detail = 'expected paid or rejected';
  end if;
  if p_outcome = 'rejected' and nullif(p_reason, '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Lock the request ; two admins clicking at once serialize here.
  select * into v_req
    from public.withdrawal_requests
    where id = p_request_id
    for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request_closed'
      using errcode = '22023', detail = 'request is ' || v_req.status;
  end if;

  v_before := to_jsonb(v_req);

  if p_outcome = 'paid' then
    -- Balance is re-checked NOW (payout time), not at request time — funds
    -- were never held, the seller may have spent them since.
    select id into v_wallet_id
      from public.wallets
      where user_id = v_req.user_id and currency = v_req.currency
      for update;
    if v_wallet_id is null then
      -- No wallet = nothing was ever credited ; cannot cover the payout.
      raise exception 'insufficient_funds'
        using errcode = '22023', detail = 'no wallet for currency ' || v_req.currency;
    end if;

    v_balance := coalesce(
      (select balance_after from public.ledger_entries
         where wallet_id = v_wallet_id
         order by created_at desc, id desc limit 1), 0);
    if v_balance < v_req.amount_minor then
      raise exception 'insufficient_funds'
        using errcode = '22023',
              detail = format('balance %s < amount %s', v_balance, v_req.amount_minor);
    end if;

    -- EXTERNAL EXIT : one-sided debit, mirror image of confirm_topup's
    -- one-sided credit. Running balance_after convention preserved.
    insert into public.ledger_entries
      (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values
      (v_wallet_id, 'debit', v_req.amount_minor,
       v_balance - v_req.amount_minor, 'withdrawal_payout', p_request_id);
  end if;
  -- 'rejected' : no money movement (nothing was held).

  update public.withdrawal_requests
    set status     = p_outcome,
        reason     = nullif(p_reason, ''),
        decided_at = v_now,
        decided_by = p_admin_id,
        updated_at = v_now
    where id = p_request_id;

  select to_jsonb(w.*) into v_after
    from public.withdrawal_requests w
    where w.id = p_request_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id,
    'withdrawal_request',
    p_request_id,
    case p_outcome when 'paid' then 'withdrawal.paid' else 'withdrawal.rejected' end,
    nullif(p_reason, ''),
    jsonb_build_object(
      'outcome', p_outcome,
      'amount_minor', v_req.amount_minor,
      'currency', v_req.currency,
      'destination', v_req.destination
    ),
    v_before,
    v_after
  );

  return query
    select * from public.withdrawal_requests where id = p_request_id;
end;
$$;

revoke all on function public.process_withdrawal(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.process_withdrawal(uuid, uuid, text, text)
  to service_role;

-- ===========================================================================
-- get_wallet_balances_bulk : balances for a set of users in one round-trip.
-- list-withdrawals attaches "current balance vs requested amount" to every
-- pending request so the admin sees red flags without N+1 RPC calls.
-- Users without a wallet simply don't appear (edge fn defaults to 0).
-- ===========================================================================
create or replace function public.get_wallet_balances_bulk(p_user_ids uuid[])
returns table (user_id uuid, currency text, balance_minor bigint)
language sql
security definer
set search_path to ''
as $$
  select w.user_id, w.currency,
         coalesce((select le.balance_after from public.ledger_entries le
                   where le.wallet_id = w.id
                   order by le.created_at desc, le.id desc limit 1), 0)
  from public.wallets w
  where w.user_id = any(p_user_ids);
$$;

revoke all on function public.get_wallet_balances_bulk(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_wallet_balances_bulk(uuid[])
  to service_role;
