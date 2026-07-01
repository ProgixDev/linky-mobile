-- Remove the demo-seed auto-credit (100,000,000 GNF on every new wallet).
-- Required before real P2P money movement is enabled: with free money minted on
-- signup, P2P send would be an instant money-laundering / cash-out funnel.
--
-- After this runs, new wallets start at 0 GNF. Existing demo balances are NOT
-- clawed back (the ledger is append-only); wipe test data separately if needed.
-- Undoes 20260602_01_demo_seed_on_wallet_create.sql.
drop trigger if exists demo_seed_new_wallet_trg on public.wallets;
drop function if exists public.demo_seed_new_wallet();
