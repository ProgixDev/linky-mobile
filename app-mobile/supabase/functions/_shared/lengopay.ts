// Lengopay v1 Payments HTTP client — rewritten 2026-07-07 against the REAL
// production API (verified live with the merchant licence; see
// lengopay-types.ts header for the probe results). The pre-rewrite client was
// built on assumed shapes and had 4 wire bugs: Bearer instead of Basic auth,
// wrong base URL, snake_case field guesses, GET status instead of POST.
//
// Flow: init creates a hosted payment page (payment_url) where the buyer
// picks Orange Money / MTN MoMo and approves; cron-poll-intents polls
// transaction/status until SUCCESS/FAILED, the 15-min TTL sweep cancels
// abandoned links.
//
// v2 added 2026-09-05 (initPaymentV2/getPaymentStatusV2, below): in-app
// Orange Money / MTN, no hosted page — the buyer's number is sent directly
// and Linky's own screens poll for the outcome instead of a WebView. v1
// stays as-is for now (nothing still calls it after this change, but it's
// not deleted — Card/Kulu/Soutra Money would extend the v2 client, not
// resurrect v1).
//
// Env:
//   LINKY_LENGOPAY_BASE_URL     — default https://portal.lengopay.com
//                                 (point at the mock fn base only for tests)
//   LINKY_LENGOPAY_LICENSE_KEY  — raw licence, sent as `Authorization: Basic {key}`
//   LINKY_LENGOPAY_WEBSITE_ID   — merchant site id ('websiteid' on the wire)

import {
  normalizeLengopayStatus,
  type LengopayInitRequest,
  type LengopayInitResponse,
  type LengopayStatusResponse,
  type LengopayV2InitRequest,
  type LengopayV2InitResponse,
} from '@shared/lengopay-types.ts';

// B (resilience): hard-cap rail HTTP calls. Status should be sub-second; if
// it hangs beyond TIMEOUT_MS we fail fast and classify as RAIL_TRANSIENT.
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseUrl(): string {
  return Deno.env.get('LINKY_LENGOPAY_BASE_URL') || 'https://portal.lengopay.com';
}

function websiteId(): string {
  return Deno.env.get('LINKY_LENGOPAY_WEBSITE_ID') ?? '';
}

function authHeaders(): Record<string, string> {
  const license = Deno.env.get('LINKY_LENGOPAY_LICENSE_KEY') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    // Lengopay's "Basic" is the raw licence key — NOT base64(user:pass).
    'Authorization': `Basic ${license}`,
  };
  // Only needed when BASE_URL points at a Supabase-hosted mock (gateway
  // routing); real Lengopay ignores it.
  if (anon) h['apikey'] = anon;
  return h;
}

export function lengopayConfigured(): boolean {
  return !!Deno.env.get('LINKY_LENGOPAY_LICENSE_KEY') && !!websiteId();
}

// Plafond par transaction signale par le client (25/08 : reunion Lengopay) :
// Orange Money / MTN via Lengopay refuse au-dela de 15 000 000 GNF. Le
// decoupage automatique en plusieurs encaissements est une demande separee,
// non construite ici (cf. message client) — ce garde-fou empeche seulement
// une tentative vouee a l'echec cote Lengopay de partir sans prevenir
// l'acheteur pourquoi.
export const LENGOPAY_MAX_AMOUNT_MINOR = 15_000_000;

export async function initPayment(req: LengopayInitRequest): Promise<LengopayInitResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v1/payments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      websiteid: websiteId(),
      amount: req.amount_minor,
      currency: req.currency,
    }),
  });
  if (!res.ok) throw new Error(`Lengopay init ${res.status}: ${await res.text()}`);
  const raw = await res.json() as { status?: string; pay_id?: string; payment_url?: string; message?: string };
  if (!raw.pay_id || !raw.payment_url) {
    throw new Error(`Lengopay init malformed response: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  return { pay_id: raw.pay_id, payment_url: raw.payment_url, status: 'pending' };
}

export async function getPaymentStatus(payId: string): Promise<LengopayStatusResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v1/transaction/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pay_id: payId, websiteid: websiteId() }),
  });
  if (!res.ok) throw new Error(`Lengopay status ${res.status}: ${await res.text()}`);
  const raw = await res.json() as { status?: unknown; pay_id?: string; message?: string };
  return {
    pay_id: raw.pay_id ?? payId,
    status: normalizeLengopayStatus(raw.status),
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}

/** Hosted payment page for a pay_id — reconstructable client-side too. */
export function paymentUrlFor(payId: string): string {
  return `https://payment.lengopay.com/${payId}`;
}

// ─── v2 — in-app Orange Money / MTN (no hosted page) ────────────────────────
// See lengopay-types.ts header for the full wire shapes retrieved 2026-09-05.

/** Un numero utilisable comme compte Orange Money / MTN guineen. */
export function isGnE164(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && /^\+224\d{9}$/.test(phone);
}

/** +224XXXXXXXXX (what this codebase stores) -> XXXXXXXXX (what v2's `account` wants).
 *  Les appelants doivent avoir filtre avec isGnE164 AVANT (et rendre alors une
 *  erreur comprehensible a l'acheteur) : ce throw-ci n'est qu'un dernier
 *  garde-fou, il produirait un « echec de l'initialisation » opaque. */
export function toLocalGnAccount(e164: string): string {
  const m = /^\+224(\d{9})$/.exec(e164);
  if (!m) throw new Error(`toLocalGnAccount: not a Guinea E.164 number: ${e164}`);
  return m[1];
}

export async function initPaymentV2(req: LengopayV2InitRequest): Promise<LengopayV2InitResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v2/payments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      amount: String(req.amount_minor),
      currency: req.currency,
      websiteid: websiteId(),
      type_account: req.type_account,
      account: req.account,
    }),
  });
  if (!res.ok) throw new Error(`Lengopay v2 init ${res.status}: ${await res.text()}`);
  const raw = await res.json() as {
    success?: boolean; pay_id?: string; message?: string;
    requires_otp?: boolean; webview_url?: string;
    data?: { pay_id?: string; requires_otp?: boolean; webview_url?: string };
  };
  const payId = raw.pay_id ?? raw.data?.pay_id;
  if (!raw.success || !payId) {
    throw new Error(`Lengopay v2 init malformed/failed response: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  // lp-om-gn/lp-momo-gn sont documentes comme finalisables en un seul appel
  // (seuls Kulu et Soutra Money ont une 2e etape). Si une etape supplementaire
  // remonte quand meme, on NE JETTE PAS : Lengopay a deja la demande, et le
  // client (message du 2026-09-05) decrit bien un « code de validation » recu
  // par l'acheteur pour OM et MTN. Jeter ici annulerait la commande cote Linky
  // alors que l'acheteur peut encore confirmer sur son telephone — argent
  // preleve, commande annulee, exactement ce que l'ordre S2 existe pour eviter.
  // On garde donc le pay_id, on laisse le sondage trancher (succes s'il
  // confirme, expiration a 15 min sinon), et on journalise fort pour qu'on le
  // voie tout de suite dans les logs si ce cas se produit vraiment.
  const extraStep = raw.requires_otp ?? raw.data?.requires_otp
    ? 'requires_otp'
    : (raw.webview_url ?? raw.data?.webview_url) ? 'webview_url' : null;
  if (extraStep) {
    console.warn('[lengopay] v2 init: etape supplementaire inattendue pour orange/mtn', {
      pay_id: payId, extraStep, raw: JSON.stringify(raw).slice(0, 300),
    });
  }
  return { pay_id: payId };
}

/** Status body shape assumed identical to v1 ({pay_id, websiteid}) — the v2
 *  doc only mentioned this endpoint in passing, not verified. Safe either
 *  way: normalizeLengopayStatus() defaults anything unrecognized to
 *  'pending', so a wrong assumption here means a slower confirmation (until
 *  the 15-min TTL sweep), never a wrong SUCCESS/FAILED shown to the buyer. */
export async function getPaymentStatusV2(payId: string): Promise<LengopayStatusResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v2/transaction/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pay_id: payId, websiteid: websiteId() }),
  });
  if (!res.ok) throw new Error(`Lengopay v2 status ${res.status}: ${await res.text()}`);
  const raw = await res.json() as { status?: unknown; pay_id?: string; message?: string };
  return {
    pay_id: raw.pay_id ?? payId,
    status: normalizeLengopayStatus(raw.status),
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}
