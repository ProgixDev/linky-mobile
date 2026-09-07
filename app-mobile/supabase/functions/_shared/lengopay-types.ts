// Lengopay wire types — VERIFIED against the live production API on
// 2026-07-07 with the merchant's real licence (probe transcript in the
// launch-sprint notes):
//
//   Create : POST https://portal.lengopay.com/api/v1/payments
//            headers  Authorization: Basic {licence}   (raw key, no base64-of-pair)
//            body     { websiteid, amount, currency }  (amount number or string)
//            200 →    { status:'Success', pay_id, payment_url }
//            400 →    { status:'ERROR', message } ('Missing body fields',
//                     'Unsupported amount' — amounts must be ≥ some floor;
//                     100 GNF was refused, 1000 GNF accepted)
//   Status : POST https://portal.lengopay.com/api/v1/transaction/status
//            body     { pay_id, websiteid }
//            200 →    { status:'INITIATED'|..., pay_id, gateway, account, amount, date }
//
// The buyer completes the payment ON Lengopay's hosted page (payment_url —
// they pick Orange Money / MTN MoMo there), so init needs no phone/gateway.
// pay_id is base64 WITH padding — never decode or re-encode it.

// LengopayMethod vit desormais dans _shared/lengopay.ts, aux cotes de
// LENGOPAY_RAILS qui en est la seule source de verite. La definition qui
// etait ici datait d'avant le 2026-09-07 : elle affirmait encore que 'card'
// est un rail Lengopay (c'est Stripe, et uniquement Stripe, depuis le
// dedoublement des deux cartes) et ignorait kulu / soutramoney /
// lengopay-card. Deux types du meme nom dans le meme espace @shared, dont
// un faux, est exactement ce qui fait router un paiement au mauvais endroit.
export type LengopayCurrency = 'GNF' | 'EUR';

/** Our normalized rail status (client normalizes Lengopay's wire casing). */
export type LengopayIntentStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface LengopayInitRequest {
  /** Integer minor units (GNF has no decimals — minor == major). */
  amount_minor: number;
  currency: LengopayCurrency;
}

export interface LengopayInitResponse {
  pay_id: string;
  /** Hosted payment page (https://payment.lengopay.com/{pay_id}). */
  payment_url: string;
  status: LengopayIntentStatus; // normalized ('pending' right after init)
}

export interface LengopayStatusResponse {
  pay_id: string;
  status: LengopayIntentStatus; // normalized
  message: string;
  error_code?: string;
}

/**
 * Wire → normalized status. Conservative default: anything unknown stays
 * 'pending' so the 15-min TTL sweep (not a mis-mapping) decides the outcome.
 * Wire values observed/documented: INITIATED (fresh link, unpaid), PENDING,
 * SUCCESS, FAILED, CANCELLED/CANCELED, EXPIRED. Some deployments return
 * numeric statuses — treat non-strings as pending.
 */
// Lengopay v2 — retrieved live from portal.lengopay.com > Mode developpeur on
// 2026-09-05. Same auth (Authorization: Basic {licence}) and websiteid as v1,
// but the buyer's account is passed directly (no hosted page) and the
// behavior branches by type_account:
//
//   Create : POST https://portal.lengopay.com/api/v2/payments
//            body   { amount (STRING, e.g. "2000"), currency, websiteid,
//                      type_account, account, callback_url? }
//            200 →  { success:true, pay_id, account, date }              -- lp-om-gn / lp-momo-gn / lp-card-gn (assumed same shape as the generic example ; no OTP/webview per the doc)
//                    { success:true, pay_id, requires_otp:true, ... }    -- lp-kulu-gn (confirm via /api/v2/authenticate)
//                    { success:true, pay_id, webview_url, ... }          -- lp-soutramoney-gn (buyer finishes in a webview)
//   Confirm: POST https://portal.lengopay.com/api/v2/authenticate  { pay_id, code }   -- Kulu OTP only
//   Status : POST https://portal.lengopay.com/api/v2/transaction/status  -- exact body NOT verified from the doc,
//            assumed { pay_id, websiteid } (same as v1) pending a real test.
//   Callback (optional, not used here — no signature shown in the doc, so an
//   inbound POST can't be trusted without one) : { pay_id, status, amount, message, Client }.
//
// account is the LOCAL Guinea number, WITHOUT the +224 prefix (e.g. "620124578"),
// unlike everywhere else in this codebase which stores E.164.
//
// 2026-09-07 : les cinq type_account sont desormais appelables (demande client
// « pour les profils en Guinee, le bouton Carte bancaire Stripe se transforme
// en page de paiement In App Carte bancaire + Wallet »). lp-card-gn reste le
// seul SANS section dediee dans la doc : on ne devine pas sa mecanique, on
// reagit a la FORME de sa reponse (webview / otp / ni l'un ni l'autre), donc
// quelle qu'elle soit l'acheteur n'est jamais bloque sans issue.
export type LengopayV2TypeAccount = 'lp-om-gn' | 'lp-momo-gn' | 'lp-card-gn' | 'lp-kulu-gn' | 'lp-soutramoney-gn';

export interface LengopayV2InitRequest {
  amount_minor: number;
  currency: LengopayCurrency;
  type_account: LengopayV2TypeAccount;
  /** Local Guinea number, no +224 — see toLocalGnAccount(). OPTIONNEL depuis le
   *  2026-09-07 : Soutra Money et la carte n'encaissent pas sur un numero
   *  (l'acheteur s'identifie sur la page qu'ils renvoient). */
  account?: string;
}

export interface LengopayV2InitResponse {
  pay_id: string;
  /** Kulu : l'acheteur recoit un code par SMS, a confirmer via /api/v2/authenticate. */
  requires_otp?: boolean;
  /** Soutra Money (et peut-etre lp-card-gn) : page a ouvrir pour finir le paiement. */
  webview_url?: string;
}

/** Ce qu'il reste a faire a l'acheteur apres l'init. 'poll' = rien, il confirme
 *  sur son telephone et le cron tranche. */
export type LengopayNextStep =
  /** fallbackUrl : une page est bien revenue, mais sur un rail qui n'est PAS
   *  cense en avoir (Orange, MTN). On ne detourne pas l'acheteur vers elle —
   *  son geste normal reste de valider sur son telephone — mais on la garde
   *  sous la main comme second recours. Voir railNextStep. */
  | { kind: 'poll'; fallbackUrl?: string }
  /** payId : ce que l'ecran de saisie devra renvoyer a /api/v2/authenticate. Il
   *  voyage DANS l'etape parce que toutes les surfaces n'exposent pas
   *  l'intention — le panier multi-boutiques, par exemple, ne rend que les
   *  commandes creees, et n'aurait donc rien a confirmer. */
  | { kind: 'otp'; payId: string }
  | { kind: 'webview'; url: string };

export function normalizeLengopayStatus(raw: unknown): LengopayIntentStatus {
  if (typeof raw !== 'string') return 'pending';
  switch (raw.toUpperCase()) {
    case 'SUCCESS':
    case 'SUCCESSFUL':
      return 'success';
    case 'FAILED':
    case 'FAILURE':
      return 'failed';
    case 'CANCELLED':
    case 'CANCELED':
    case 'EXPIRED':
      return 'cancelled';
    case 'INITIATED':
    case 'PENDING':
    case 'PROCESSING':
    default:
      return 'pending';
  }
}
