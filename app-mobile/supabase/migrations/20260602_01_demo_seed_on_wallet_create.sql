-- =====================================================================
-- TODO: REMOVE THIS ENTIRE MIGRATION BEFORE V1 PRODUCTION LAUNCH
-- =====================================================================
-- Demo-phase hack so the client (and beta cohort) can test transactions
-- without manual top-up. Every newly-created GNF wallet for a real user
-- gets auto-credited 100,000,000 GNF (~$10,000) via the legitimate
-- one-sided ledger pattern (topup_intents row + credit entry tied via
-- ref_id, ref_type='topup', method='demo_seed').
--
-- Why a trigger and not a one-shot SQL :
--   - place_order, confirm_topup, confirm_order_receipt, place_order_rail_branch,
--     and the qr_scan_gate RPC all use the same idempotent
--     `insert into wallets ... on conflict do nothing` pattern (6 call sites).
--     A trigger AFTER INSERT catches all of them uniformly without touching
--     each RPC.
--
-- Hard gates :
--   1. NEW.currency must be 'GNF' — EUR diaspora wallets go through a separate
--      rail and shouldn't be auto-seeded.
--   2. NEW.user_id must NOT be a system uid (ESCROW = ...001, PLATFORM = ...002).
--      The system uids ARE real rows in public.users (per H2 escrow setup), so
--      a JOIN check is insufficient. Must exclude by literal value.
--
-- Removal at V1 :
--   drop trigger if exists demo_seed_new_wallet_trg on public.wallets;
--   drop function if exists public.demo_seed_new_wallet();
--
-- See memory entry project-demo-seed-trigger for context.

create or replace function public.demo_seed_new_wallet()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_topup_id  uuid;
  v_amount    bigint := 100000000;  -- 100M GNF (~$10k)
begin
  -- Skip non-GNF wallets
  if new.currency <> 'GNF' then
    return new;
  end if;

  -- Skip system wallets (ESCROW + PLATFORM hold real funds; phantom credits
  -- would break the escrow invariant). Both have synthetic uids in public.users
  -- so a JOIN check passes — must exclude by literal value.
  if new.user_id in (
    '00000000-0000-0000-0000-000000000001'::uuid,  -- ESCROW
    '00000000-0000-0000-0000-000000000002'::uuid   -- PLATFORM
  ) then
    return new;
  end if;

  -- Create the topup_intent (audit anchor for the credit)
  insert into public.topup_intents (user_id, currency, amount_minor, method, status)
  values (new.user_id, 'GNF', v_amount, 'demo_seed', 'completed')
  returning id into v_topup_id;

  -- Append the one-sided credit. Wallet was just inserted so balance_after = amount.
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
  values (new.id, 'credit', v_amount, v_amount, 'topup', v_topup_id);

  return new;
end;
$$;

revoke all on function public.demo_seed_new_wallet() from public, anon, authenticated;

drop trigger if exists demo_seed_new_wallet_trg on public.wallets;
create trigger demo_seed_new_wallet_trg
after insert on public.wallets
for each row
execute function public.demo_seed_new_wallet();
