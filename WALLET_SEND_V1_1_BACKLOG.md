# Wallet send (P2P) — V1.1 hardening backlog

Built 2026-06-20 during pre-prod sweep. The ledger primitive is sound
(`post_transfer` is the same atomic double-entry call escrow uses — both
wallets row-locked in id order, balance check before debit, append-only
ledger), so there is no theft / overdraft risk at the SQL layer.

Gated OFF for shipped builds at three layers — flip ALL to release :

1. `src/lib/flags.ts` — `P2P_SEND_ENABLED = false` (UI button hidden,
   `/wallet/envoyer` redirects to `/wallet` on mount)
2. `supabase/functions/wallet-send/index.ts` — `P2P_ENABLED = false`
   (handler refuses with `FEATURE_DISABLED 403` before any work)
3. Server gate is defense-in-depth against the client gate ; both must
   flip and the fn must be redeployed (`scripts/deploy-edge.ps1 -Slug
   wallet-send`) before P2P send is live again.

Clear EVERY item below before flipping any of the flags. The ordering
reflects the launch reviewer's read of the threat model — BLOCKER /
HIGH / MEDIUM / LOW track decreasing impact, not decreasing certainty.

---

## 1. [BLOCKER] Demo-seed mint funnel via recipient wallet lazy-create

`wallet-send` lazy-creates the recipient's GNF wallet when they don't
have one yet (`supabase/functions/wallet-send/index.ts` ~ lines 148-153).
That INSERT into `public.wallets` fires the
`demo_seed_new_wallet_trg` AFTER INSERT trigger from
`migrations/20260602_01_demo_seed_on_wallet_create.sql`, which credits
**100,000,000 GNF** of phantom money to the newly-created wallet.

Concretely : a malicious sender can mint 100M GNF into any non-Linky
phone number's account by triggering wallet creation through P2P send.
Today this is "only" the same dev scaffold the rest of the app uses,
but `wallet-send` is the ONLY endpoint that creates a wallet for a
user OTHER than the caller — every other wallet creation path was
caller-scoped.

Fix options :

a. Refuse `RECIPIENT_WALLET_NOT_FOUND` and require the recipient to
   open the wallet tab once (so the lazy-create happens under their
   session, not the sender's). Cleanest if the demo-seed is sticking
   around for testing.

b. Bypass `demo_seed_new_wallet_trg` for inserts done from this
   handler (set a session-local GUC the trigger reads, or use a
   dedicated RPC that `SET LOCAL session_replication_role = replica`).
   Riskier — easy to leak the bypass to other code paths.

c. Drop the demo-seed trigger entirely (see `[[project_prelaunch_cutover]]`
   #1). This funnel is then moot. **This is the right answer at
   cutover.** Recording the dependency explicitly so the cutover and
   the P2P flip don't get sequenced wrong.

The trigger drop and the P2P flip MUST be coordinated. The acceptance
criterion is "with the demo-seed trigger live, no API path can mint
100M GNF into a non-caller wallet".

---

## 2. [HIGH] No daily / velocity cap

Today only the per-send floor (1k GNF) and ceiling (1M GNF) gate the
amount. A caller can still drain their entire wallet in N sends with
N distinct idempotency keys ; the existing reserve-first wrap protects
against a SINGLE key being replayed, not against N keys.

Fix : per-sender rolling-24h aggregate cap + a max-count cap, both
enforced INSIDE the transfer transaction. Standalone counter +
post_transfer is racy — two parallel sends each read "0/cap" before
either writes. Build a dedicated `p2p_send` RPC that :

- Locks the sender's wallet row first (`SELECT … FOR UPDATE`).
- Aggregates the last-24h debits on `(wallet_id, ref_type='p2p_transfer')`
  while still holding the lock.
- Aborts with a named error (`P2P_DAILY_CAP_REACHED`) if adding the new
  amount would exceed the cap.
- Calls `post_transfer` under the same lock so the count and the debit
  are committed together.

Numbers : the Phase K dispute-confirm threshold is 5M GNF
(`[[project_phase_k_threshold_signoff]]`). Daily cap should sit at or
below that ; a starting suggestion is 2M GNF/day + max 10 sends/day,
revisitable after the first week of telemetry.

---

## 3. [HIGH] No KYC gate on money-out (system-wide, not just P2P)

`wallet-send` accepts an unvetted account the same as a KYC-approved
one. So does `wallet-withdraw-request` (memo `[[project_phase_s_withdrawals]]`).
That is the gap legal flagged for the auth-middleware rewrite
(`[[project_linky_overview]]` Why line).

Decide policy at the system level, not per endpoint :
- KYC required for any wallet outflow above X GNF ?
- Required for send AND withdraw, or only one ?
- What grace value (small everyday flows) stays open ?

Implementation pattern : reuse the existing seller-side guard. The
KYC gate already lives in `product-create`'s requireUser pathway
(`kyc_status === 'approved'` check returning `KYC_REQUIRED 403`).
Copying that into the money-out fns is mechanical ; the open work is
the policy decision.

---

## 4. [MEDIUM] Phone-enumeration oracle

The handler today returns three distinct error codes that together
let a caller probe the global phone space :
- `RECIPIENT_NOT_FOUND` ⇒ "this number has no Linky account"
- `RECIPIENT_NOT_VERIFIED` ⇒ "this number HAS a Linky account but
  the user never confirmed the phone"
- `CANNOT_SEND_TO_SELF` ⇒ "this number IS the caller's own number"

In aggregate, an attacker can map "which Guinea phone numbers are on
Linky" and "which of those are tied to MY own account" by sweeping
the +224 6xx number space and reading the response codes. The
phone-add path (memo `[[phone_add_otp_verified]]`) has the same data
but is OTP-gated per request, so this fn is the cheap oracle.

Fix : collapse all three to one generic `INVALID_TARGET 400` with a
flat user-facing message ("Numéro destinataire invalide."). Keep the
distinct internal log lines for ops, but never let them leak to the
wire.

---

## 5. [LOW] Idempotency reserved before auth on a money route

`makePost` reserves the idempotency key BEFORE running the handler
(see `_shared/wrap.ts`), which means the reserve happens before
`requireUser` is called. For non-money endpoints this is fine — the
key collides only when the legitimate caller retries. For money
endpoints it means an anonymous attacker with a guessed key could
pre-reserve it, and the legitimate caller's retry then sees
`REQUEST_IN_FLIGHT 409` until the reservation expires.

Two options :
- Move `requireUser` AHEAD of the reservation for money routes (custom
  wrap variant, or a `makeAuthedPost` helper).
- Scope the idempotency key by sender id : `idem_key + ':' + userId`.
  Doesn't fix the pre-auth body-leak risk if any but is cheaper.

Low priority because the symptom is "legit caller gets a transient
409, not a wrong outcome". File the helper, fix at the wrap layer
when other money routes need it.

---

## 6. [LOW] `completeIdempotency` UPDATE-failure → duplicate-send window

The wrap calls `completeIdempotency` after the handler succeeds. If
that UPDATE fails (network blip mid-flight), the reservation row stays
in the `in_flight` state and a retry hits `REQUEST_IN_FLIGHT 409`
until the row TTLs. But the handler already wrote ledger entries —
the retry sees an error, the user re-presses, and on the third try
(after TTL) the same body would replay as a fresh request and
double-send.

Fix : derive `post_transfer`'s `ref_id` deterministically from the
idempotency key (e.g. `uuidv5(idem_key, 'p2p_transfer')`) and add a
`UNIQUE (ref_type='p2p_transfer', ref_id)` partial index on
`ledger_entries`. The second `post_transfer` then bounces on the
unique violation before moving money, and the wrap's `cancel` path
can find the prior debit and surface the success response.

Same fix would harden the topup + escrow paths, but they have other
guards (Stripe's own idempotency, scan-token consumption) so the
window is wider on P2P.

---

## Acceptance checklist before flipping the flag

- [ ] #1 demo-seed funnel : reviewer confirms the decoupling pattern,
      drop trigger applied (or bypass implemented + tested)
- [ ] #2 daily cap + velocity : `p2p_send` RPC merged with locked
      aggregate read, smoke tests for parallel-send race
- [ ] #3 KYC policy locked + reused in `wallet-send` and
      `wallet-withdraw-request`
- [ ] #4 error collapse to `INVALID_TARGET`, ops log still
      differentiates internally
- [ ] #5 + #6 either fixed, or explicitly accepted-as-residual-risk
      with a follow-up date

When all six are signed off : flip `P2P_SEND_ENABLED` (mobile) and
`P2P_ENABLED` (edge fn) to `true`, redeploy `wallet-send`, smoke-test
the happy path with two test accounts, and remove this gate.
