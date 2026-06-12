-- Phase V.7 -- confirm_topup RPC fix.
--
-- Pre-existing bug : the original 20260529_05 declared an OUT parameter
-- `wallet_id` (returns table (wallet_id uuid, new_balance bigint)) and
-- then referenced the unqualified column name `wallet_id` inside the
-- balance subquery :
--
--   v_balance := coalesce(
--     (select balance_after from public.ledger_entries
--        where wallet_id = v_wallet_id     -- <- unqualified
--        order by created_at desc, id desc limit 1), 0);
--
-- PL/pgSQL resolves the bare identifier against the function's own OUT
-- parameter (which is null at that point) and the predicate becomes
-- `null = v_wallet_id` -> null -> the subquery returns no rows, v_balance
-- defaults to 0, and the credit posts `balance_after = 0 + amount` even
-- when the wallet has a non-zero running balance from earlier topups or
-- other credits. End state : every fresh topup overwrites the ledger's
-- running balance to its own amount.
--
-- The bug stayed dormant because the Lengopay topup rail is contract-
-- blocked in V1 (no real confirm_topup call has flowed through it). But
-- the rail comes online whenever the Lengopay contract lands, and this
-- bug would silently corrupt every buyer's wallet on every topup.
--
-- Fix : qualify every column reference inside the function body to
-- public.<table>.<column>. Belt-and-braces : also rename internal vars
-- so they can never be mistaken for parameters in a future edit.
-- The signature + permissions are unchanged ; CREATE OR REPLACE keeps
-- the function OID and existing GRANTs.

create or replace function public.confirm_topup(p_topup_id uuid)
returns table (wallet_id uuid, new_balance bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup     record;
  v_wallet_id uuid;
  v_balance   bigint;
begin
  -- Lock the topup row first ; if two operators click "confirm" at once
  -- only one proceeds.
  select t.id, t.user_id, t.currency, t.amount_minor, t.status
    into v_topup
    from public.topup_intents t
    where t.id = p_topup_id
    for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if v_topup.status <> 'pending' then
    raise exception 'TOPUP_NOT_PENDING';
  end if;

  -- Ensure a wallet exists for this user + currency. unique
  -- (user_id, currency) makes the conflict path a no-op if the wallet
  -- was created earlier.
  insert into public.wallets (user_id, currency)
    values (v_topup.user_id, v_topup.currency)
    on conflict (user_id, currency) do nothing;

  select w.id into v_wallet_id
    from public.wallets w
    where w.user_id = v_topup.user_id and w.currency = v_topup.currency
    for update;

  -- Phase V.7 -- qualify ledger_entries.wallet_id. Pre-fix the unqualified
  -- `wallet_id` resolved to the OUT parameter (null) instead of the
  -- column, so v_balance silently fell back to 0 every topup.
  v_balance := coalesce(
    (select le.balance_after from public.ledger_entries le
       where le.wallet_id = v_wallet_id
       order by le.created_at desc, le.id desc
       limit 1), 0);

  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (v_wallet_id, 'credit', v_topup.amount_minor, v_balance + v_topup.amount_minor, 'topup', p_topup_id);

  update public.topup_intents
    set status = 'completed', updated_at = now()
    where id = p_topup_id;

  wallet_id := v_wallet_id;
  new_balance := v_balance + v_topup.amount_minor;
  return next;
end;
$$;

revoke all on function public.confirm_topup(uuid) from public, anon, authenticated;
grant execute on function public.confirm_topup(uuid) to service_role;
