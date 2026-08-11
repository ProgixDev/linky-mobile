-- ============================================================================
-- Security hardening (2026-07-29) — Supabase security-advisor remediation.
-- Applied to prod (mkaddhcjneilvwqethjo) via the Management API on 2026-07-29.
--
-- WHY THIS IS SAFE
-- The Linky mobile app NEVER calls Postgres RPCs or tables directly: verified
-- there is no `.rpc(` / `.from(` in app-mobile/src|app. Every DB access goes
-- through an edge function that uses the service_role key (_shared/db.ts →
-- serviceClient(), injected by _shared/wrap.ts makePost as `sb`). The realtime
-- client uses the anon key for channel subscriptions ONLY. And NONE of these
-- functions are referenced by an RLS policy (verified via pg_policies), so
-- revoking anon/authenticated EXECUTE cannot break realtime or any RLS check.
-- ============================================================================

-- 1) ERROR: security_definer_view (x2)
-- These two public views ran with the (privileged) view owner's rights, so a
-- caller could read the underlying tables bypassing RLS. Make them respect the
-- querying role's RLS instead. Edge functions use service_role (bypasses RLS),
-- so all server-side reads keep returning full data — nothing breaks.
alter view public.shops_with_counts    set (security_invoker = on);
alter view public.properties_with_cover set (security_invoker = on);

-- 2) WARN: function_search_path_mutable (x1)
-- Every other function already pins search_path=""; this trigger was the only
-- one missing it. Its body is just `raise exception ...` (no object references),
-- so an empty search_path is safe.
alter function public.ledger_entries_immutable() set search_path = '';

-- 3) WARN: anon/authenticated_security_definer_function_executable (x47 each)
-- Revoke EXECUTE from anon + authenticated on EVERY SECURITY DEFINER function in
-- public. Without this, anyone holding the public anon key could
-- POST /rest/v1/rpc/<fn> and call privileged functions directly — place_order,
-- confirm_topup, post_transfer, get_wallet_balances, admin_overview,
-- admin_resolve_booking, process_withdrawal, ... — bypassing the auth checks the
-- edge functions perform. These functions have explicit anon=X / authenticated=X
-- grants; a few (demo_seed_new_wallet, dispute_order, kick_payment_intents_poll)
-- instead had a PUBLIC grant. Revoking from public + anon + authenticated covers
-- both cases. service_role keeps its explicit grant, so the app keeps working.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef = true
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- NOT changed here (deliberate):
--  * extension_in_public (pg_net): relocating a live extension other objects
--    depend on is riskier than this low-severity warning. Left in place.
--  * rls_enabled_no_policy (x35): RLS enabled + zero policies = deny-all to
--    anon/authenticated, which is the intended locked-down state (edge functions
--    use service_role). No action needed.
--
-- FUTURE MIGRATIONS: any NEW SECURITY DEFINER function created later will again
-- be granted to anon/authenticated by Supabase defaults — re-run block (3) (or
-- add an explicit `revoke execute ... from anon, authenticated`) after adding one.
