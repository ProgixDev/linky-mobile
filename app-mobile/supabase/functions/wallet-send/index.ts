// ════════════════════════════════════════════════════════════════════════════
// PRE-PROD V1.1 — NEEDS ADVERSARIAL REVIEW BEFORE LAUNCH
// ════════════════════════════════════════════════════════════════════════════
// P2P wallet transfer (send money). The post_transfer RPC has been in the
// ledger since Phase D.1 (2026-05-29) and is the same primitive escrow uses ;
// this endpoint is a thin authed wrapper around it. P2P shipped LATE relative
// to escrow because moving money between unrelated parties without an order
// row to anchor disputes against is a different threat model from escrow,
// and the V1 scope explicitly deferred it (memo project_v1_scope).
//
// Open questions the launch reviewer MUST close before flipping this on for
// real users :
//   1. **Daily limits per sender** — no daily / monthly cap today. A
//      compromised account could drain its wallet in one tap. The Phase K
//      threshold pattern (≥ 5M GNF dispute needs a second admin) gives a
//      starting number, but P2P send is faster than a dispute so the bound
//      probably needs to be lower.
//   2. **KYC gating** — no KYC requirement today. Treating an unvetted
//      account the same as a KYC-verified one on a money-out path is the
//      flag legal raised for the auth-middleware rewrite (memo
//      project_linky_overview Why line). Decide: KYC required for send,
//      receive, both, or neither, with explicit thresholds.
//   3. **Self-deal / family-fraud** — refuses literal self-send here, but a
//      user with two phone numbers could ping-pong money between two
//      accounts to launder a fraudulent topup before withdrawal. Phase Y's
//      resolve_dispute_self_deal guard is the relevant precedent.
//   4. **Recipient consent / claim flow** — sending to a phone number that
//      isn't a Linky user yet is REFUSED here. The alternative ("send to a
//      number, recipient signs up to claim") is a known phishing surface
//      (fake "you have GNF waiting" SMS). Keeping the strict path until
//      product weighs the tradeoff.
//   5. **Notification + receipt** — no push to recipient yet (push fan-out
//      exists for orders ; reuse the same shape under ref_type='p2p_transfer').
//      Without it the recipient finds out by checking their wallet, which
//      kills the use case for "I just paid you, check".
//   6. **Reversal posture** — none. Once post_transfer commits, the ledger
//      is append-only and there is no "send-money dispute". This matches
//      mobile money rails but conflicts with the escrow story the buyers are
//      used to ; copy must make this explicit on the confirm step.
//   7. **Idempotency-key freshness** — the wrap's reserve-first idempotency
//      protects against double-send under retry, but does NOT protect
//      against a malicious client reusing a key across two different intents
//      (the wrap returns the original outcome on a hash match, not a 409).
//      That is the intended posture but worth confirming the threat model
//      with a fresh set of eyes.
//
// Until these are answered, the mobile client surfaces the send-money UI
// with a "Bêta" badge and only the test cohort can see it. See
// project_post_phase_k_queue + V1 scope memo for the launch gate.
// ════════════════════════════════════════════════════════════════════════════
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { normalizePhone } from '@shared/validate.ts';

interface Body {
  recipient_e164: string;
  amount_minor: number;
}
function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Body;
  if (typeof x.recipient_e164 !== 'string' || x.recipient_e164.length === 0) return false;
  if (typeof x.amount_minor !== 'number' || !Number.isInteger(x.amount_minor)) return false;
  if (x.amount_minor <= 0) return false;
  return true;
}

// Hard sanity cap until the launch reviewer decides on a real limit. 1M GNF
// is well below the Phase K dispute-confirm threshold (5M) so any V1.1 limit
// policy will land at or above this number ; we'd rather refuse than ship a
// no-limit money-out path.
const MAX_SEND_MINOR = 1_000_000;
// Floor that mirrors the recharger min so we don't waste ledger rows on
// dust transfers. Pairs with the GNF-has-no-decimals assumption.
const MIN_SEND_MINOR = 1_000;

// Server-side kill switch — defense in depth on top of the client-side
// P2P_SEND_ENABLED flag. A direct API call (curl / leaked client) hits the
// same wall as a tap in the UI. Flip to true ONLY when the items in
// WALLET_SEND_V1_1_BACKLOG.md are closed.
const P2P_ENABLED = false;

Deno.serve(makePost<Body>('/v1/wallet/send', valid, async ({ sb, body, req }) => {
  if (!P2P_ENABLED) {
    throwApi('FEATURE_DISABLED', 403, 'Bientôt disponible.');
  }
  const senderId = await requireUser(req);

  if (body.amount_minor < MIN_SEND_MINOR) {
    throwApi('AMOUNT_TOO_LOW', 400, 'Montant trop faible.');
  }
  if (body.amount_minor > MAX_SEND_MINOR) {
    throwApi('AMOUNT_TOO_HIGH', 400, 'Montant trop élevé. Pendant la bêta, le plafond par envoi est limité.');
  }

  const recipientPhone = normalizePhone(body.recipient_e164);
  if (!recipientPhone) throwApi('INVALID_TARGET', 400, 'Numéro invalide.');

  // Recipient lookup : MUST be a verified phone on an existing Linky user.
  // An unverified phone here would let an attacker who briefly held a victim
  // session "add" their own number then withdraw the victim's wallet through
  // P2P send. Phase pre-prod set verified_at=now() only on OTP-confirmed
  // inserts, so this filter is the load-bearing check.
  const { data: phoneRow, error: ePhone } = await sb
    .from('phones')
    .select('user_id, verified_at')
    .eq('e164', recipientPhone)
    .maybeSingle();
  if (ePhone) {
    console.error('[wallet-send] phones lookup error:', ePhone);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!phoneRow) {
    throwApi('RECIPIENT_NOT_FOUND', 404, "Ce numéro n'est pas inscrit sur Linky.");
  }
  if (phoneRow.verified_at === null) {
    throwApi('RECIPIENT_NOT_VERIFIED', 400, "Ce numéro n'est pas vérifié.");
  }
  if (phoneRow.user_id === senderId) {
    throwApi('CANNOT_SEND_TO_SELF', 400, 'Tu ne peux pas t\'envoyer de l\'argent à toi-même.');
  }
  const recipientId = phoneRow.user_id;

  // Wallet resolution. The sender's GNF wallet must exist (or the recharger
  // path was never used). The recipient's wallet is created lazily here so a
  // sender-to-fresh-recipient transfer doesn't require the recipient to
  // first open the wallet tab.
  const { data: senderWallet, error: eSw } = await sb
    .from('wallets')
    .select('id')
    .eq('user_id', senderId)
    .eq('currency', 'GNF')
    .maybeSingle();
  if (eSw) {
    console.error('[wallet-send] sender wallet lookup error:', eSw);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!senderWallet) {
    throwApi('SENDER_WALLET_NOT_FOUND', 400, 'Ouvre ton wallet avant d\'envoyer.');
  }

  let recipientWalletId: string;
  {
    const { data: existing, error: eRw } = await sb
      .from('wallets')
      .select('id')
      .eq('user_id', recipientId)
      .eq('currency', 'GNF')
      .maybeSingle();
    if (eRw) {
      console.error('[wallet-send] recipient wallet lookup error:', eRw);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    if (existing) {
      recipientWalletId = existing.id;
    } else {
      const { data: created, error: eCreate } = await sb
        .from('wallets')
        .insert({ user_id: recipientId, currency: 'GNF' })
        .select('id')
        .single();
      if (eCreate || !created) {
        // Unique-violation race with another fn creating the same wallet :
        // re-read and use the winner.
        if ((eCreate as { code?: string } | null)?.code === '23505') {
          const { data: again, error: eAgain } = await sb
            .from('wallets')
            .select('id')
            .eq('user_id', recipientId)
            .eq('currency', 'GNF')
            .maybeSingle();
          if (eAgain || !again) {
            console.error('[wallet-send] recipient wallet re-read failed:', eAgain);
            throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
          }
          recipientWalletId = again.id;
        } else {
          console.error('[wallet-send] recipient wallet create error:', eCreate);
          throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
        }
      } else {
        recipientWalletId = created.id;
      }
    }
  }

  // ref_id is a fresh UUID per call — the ledger rows for this transfer
  // share it via post_transfer's atomic write. Idempotency-key replay at the
  // wrap layer means a retried POST with the same key returns the cached
  // response, not a second transfer. We use crypto.randomUUID() rather than
  // the public.uuidv7 RPC because PostgREST returns no body for that fn
  // and we'd round-trip an extra query for what's literally an in-process
  // random read.
  const refId = crypto.randomUUID();

  const { error: ePt } = await sb.rpc('post_transfer', {
    p_from_wallet: senderWallet.id,
    p_to_wallet: recipientWalletId,
    p_amount_minor: body.amount_minor,
    p_ref_type: 'p2p_transfer',
    p_ref_id: refId,
  });
  if (ePt) {
    const msg = (ePt as { message?: string }).message ?? '';
    if (msg.includes('INSUFFICIENT_FUNDS')) {
      throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant.');
    }
    console.error('[wallet-send] post_transfer error:', ePt);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du transfert.');
  }

  // Fresh balance read for the client to render against without a re-fetch.
  // Computed from balance_after on the most recent ledger entry for the
  // sender's wallet (the debit just written).
  const { data: balRow } = await sb
    .from('ledger_entries')
    .select('balance_after')
    .eq('wallet_id', senderWallet.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const newBalance = balRow ? Number(balRow.balance_after) : null;

  // Loud ops log — until daily limits + KYC gating land, every transfer is
  // an event a human might want to spot-check.
  console.warn('[wallet-send] P2P transfer completed (PRE-PROD, no daily cap yet)', {
    sender_id: senderId,
    recipient_id: recipientId,
    amount_minor: body.amount_minor,
    ref_id: refId,
  });

  return {
    body: {
      ok: true,
      ref_id: refId,
      new_balance_minor: newBalance,
    },
  };
}));
