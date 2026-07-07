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
