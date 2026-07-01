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
// ENABLED 2026-07-01 with owner sign-off. Hardening applied on this pass :
//   1. **Daily limit per sender** — DONE. 1M GNF / rolling-24h, enforced
//      atomically inside post_p2p_transfer (sender wallet locked before the
//      day's sum is read → race-free). See DAILY_CAP_MINOR below.
//   2. **KYC gating** — DONE. Sender must be kyc_status='approved'. Soft-gated
//      on diditConfig() (same posture as publish) so it doesn't brick P2P while
//      Didit creds are dark ; auto-enforces the moment they land.
//   5. **Notification + receipt** — DONE. Recipient gets an in-app + push
//      "Argent reçu" (notifyDetached, category 'system', deeplink /wallet).
//
// Still OPEN — accepted for the capped beta, revisit before scale :
//   3. **Self-deal / family-fraud** — literal self-send refused, but two
//      accounts one person controls can still ping-pong. The 1M/24h cap +
//      KYC + demo-seed removal bound the laundering value ; velocity/graph
//      detection is the real fix. Phase Y resolve_dispute_self_deal precedent.
//   4. **Recipient claim flow** — sending to a non-Linky number stays REFUSED
//      (SMS-phishing surface). Recipient must already be a verified user.
//   6. **Reversal posture** — none. Ledger is append-only, no send-money
//      dispute. Matches mobile-money rails ; the confirm step copy makes the
//      irreversibility explicit.
//   7. **Idempotency-key freshness** — reserve-first wrap stops double-send on
//      retry but returns the cached outcome (not 409) if a client reuses a key
//      across two different intents. Intended posture; documented for review.
// ════════════════════════════════════════════════════════════════════════════
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { normalizePhone } from '@shared/validate.ts';
import { diditConfig } from '@shared/didit.ts';
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';

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
// same wall as a tap in the UI. Enabled 2026-07-01 alongside the hardening
// below (KYC gate + daily cap + recipient push + demo-seed removal).
const P2P_ENABLED = true;

// Daily send cap per sender, rolling 24h, enforced ATOMICALLY inside
// post_p2p_transfer (the sender wallet is locked before the day's sum is read),
// so concurrent sends can't jointly exceed it. Bounds the blast radius of a
// compromised account.
const DAILY_CAP_MINOR = 1_000_000;

Deno.serve(makePost<Body>('/v1/wallet/send', valid, async ({ sb, body, req }) => {
  if (!P2P_ENABLED) {
    throwApi('FEATURE_DISABLED', 403, 'Bientôt disponible.');
  }
  const senderId = await requireUser(req);

  // KYC gate — a money-OUT path requires an identity-verified sender. Soft-gated
  // on Didit being configured, mirroring publish (property/product create): while
  // Didit creds are dark NO user can reach 'approved', so a hard gate would brick
  // P2P for everyone. The check activates automatically the moment Didit goes live.
  if (diditConfig()) {
    const { data: caller, error: eCaller } = await sb
      .from('users').select('kyc_status').eq('id', senderId).maybeSingle();
    if (eCaller) {
      console.error('[wallet-send] caller kyc lookup error:', eCaller);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    if (caller?.kyc_status !== 'approved') {
      throwApi('KYC_REQUIRED', 403, "Vérifie ton identité pour envoyer de l'argent.");
    }
  }

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

  const { error: ePt } = await sb.rpc('post_p2p_transfer', {
    p_from_wallet: senderWallet.id,
    p_to_wallet: recipientWalletId,
    p_amount_minor: body.amount_minor,
    p_ref_id: refId,
    p_daily_cap_minor: DAILY_CAP_MINOR,
  });
  if (ePt) {
    const msg = (ePt as { message?: string }).message ?? '';
    if (msg.includes('INSUFFICIENT_FUNDS')) {
      throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant.');
    }
    if (msg.includes('DAILY_LIMIT_EXCEEDED')) {
      throwApi('DAILY_LIMIT_EXCEEDED', 400, 'Plafond journalier atteint (1 000 000 GNF / 24 h).');
    }
    console.error('[wallet-send] post_p2p_transfer error:', ePt);
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

  // Recipient notification — "I just paid you, check" only works if they're
  // told. Best-effort (notifyDetached never throws); scoped to marketplace
  // tokens so a livreur-only device doesn't buzz for a wallet receipt.
  try {
    const senderName = await displayNameOf(sb, senderId);
    notifyDetached(sb, {
      userIds: [recipientId],
      category: 'system',
      title: 'Argent reçu',
      body: `${senderName} t'a envoyé ${formatGNF(body.amount_minor)}.`,
      iconHint: 'check',
      deeplink: '/wallet',
      app: 'marketplace',
    });
  } catch (e) {
    console.error('[wallet-send] recipient notify failed (non-fatal):', e);
  }

  console.log('[wallet-send] P2P transfer completed', {
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
