-- P2P send: atomic transfer with a rolling-24h per-sender cap enforced INSIDE
-- the transaction. This is the money-safe alternative to a check-then-act in the
-- edge function: the sender wallet is locked before the daily sum is read, so two
-- concurrent sends from the same sender serialize and can't jointly exceed the cap.
--
-- Mirrors post_transfer (same locking order, balance math, INSUFFICIENT_FUNDS
-- semantics) but is P2P-specific: ref_type is always 'p2p_transfer' and it adds
-- the DAILY_LIMIT_EXCEEDED guard. Kept separate from post_transfer so escrow /
-- topups / withdrawals are never subject to the P2P cap.
create or replace function public.post_p2p_transfer(
  p_from_wallet     uuid,
  p_to_wallet       uuid,
  p_amount_minor    bigint,
  p_ref_id          uuid,
  p_daily_cap_minor bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_currency text;
  v_to_currency   text;
  v_from_balance  bigint;
  v_to_balance    bigint;
  v_sent_24h      bigint;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_from_wallet = p_to_wallet then
    raise exception 'SAME_WALLET';
  end if;

  -- Lock both wallets in id order (deadlock-free). Holding the sender lock
  -- across the daily-sum read is what makes the cap race-free.
  perform 1 from public.wallets where id in (p_from_wallet, p_to_wallet) order by id for update;

  select currency into v_from_currency from public.wallets where id = p_from_wallet;
  select currency into v_to_currency   from public.wallets where id = p_to_wallet;
  if v_from_currency is null then raise exception 'FROM_WALLET_NOT_FOUND'; end if;
  if v_to_currency   is null then raise exception 'TO_WALLET_NOT_FOUND'; end if;
  if v_from_currency <> v_to_currency then
    raise exception 'CURRENCY_MISMATCH';
  end if;

  -- Rolling-24h P2P allowance. Only p2p_transfer debits from THIS wallet count,
  -- so escrow deposits / topups / withdrawals never consume the send cap.
  v_sent_24h := coalesce((
    select sum(amount_minor) from public.ledger_entries
    where wallet_id = p_from_wallet
      and direction = 'debit'
      and ref_type = 'p2p_transfer'
      and created_at >= now() - interval '24 hours'
  ), 0);
  if v_sent_24h + p_amount_minor > p_daily_cap_minor then
    raise exception 'DAILY_LIMIT_EXCEEDED';
  end if;

  -- Current balance = latest balance_after for the wallet (0 if no entries yet).
  v_from_balance := coalesce((select balance_after from public.ledger_entries
                              where wallet_id = p_from_wallet order by created_at desc, id desc limit 1), 0);
  v_to_balance   := coalesce((select balance_after from public.ledger_entries
                              where wallet_id = p_to_wallet order by created_at desc, id desc limit 1), 0);

  if v_from_balance < p_amount_minor then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (p_from_wallet, 'debit',  p_amount_minor, v_from_balance - p_amount_minor, 'p2p_transfer', p_ref_id);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (p_to_wallet,   'credit', p_amount_minor, v_to_balance   + p_amount_minor, 'p2p_transfer', p_ref_id);
end;
$$;

revoke all on function public.post_p2p_transfer(uuid, uuid, bigint, uuid, bigint) from public, anon, authenticated;
grant execute on function public.post_p2p_transfer(uuid, uuid, bigint, uuid, bigint) to service_role;
