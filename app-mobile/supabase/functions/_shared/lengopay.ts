// Lengopay v2 Cash-In HTTP client. Wraps mock and real rail behind a single
// interface; toggle via LINKY_LENGOPAY_BASE_URL.
//
// Dev / sandbox-absence:
//   LINKY_LENGOPAY_BASE_URL = https://<ref>.supabase.co/functions/v1/mock-lengopay
// Production:
//   LINKY_LENGOPAY_BASE_URL = unset OR set to Lengopay's real production URL

import type {
  LengopayInitRequest,
  LengopayInitResponse,
  LengopayStatusResponse,
} from '@shared/lengopay-types.ts';

// B (resilience): hard-cap rail HTTP calls. Lengopay status should be
// sub-second; if it's hanging beyond TIMEOUT_MS something's wrong upstream
// and we'd rather fail fast + classify as RAIL_TRANSIENT than stack ticks.
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

// S4 — TODO: VERIFY at sandbox-access time. Wrong here = silent 404s in
// production. Log a warning if base URL is unset so the placeholder issue
// surfaces loud before first real txn (Q8 launch gate covers verification).
const REAL_LENGOPAY_URL = 'https://api.lengopay.com/v2';
if (!Deno.env.get('LINKY_LENGOPAY_BASE_URL')) {
  console.warn(`[lengopay] LINKY_LENGOPAY_BASE_URL unset; using unverified placeholder ${REAL_LENGOPAY_URL}. Verify before V1 launch.`);
}

function baseUrl(): string {
  return Deno.env.get('LINKY_LENGOPAY_BASE_URL') || REAL_LENGOPAY_URL;
}

function authHeaders(): Record<string, string> {
  const license = Deno.env.get('LINKY_LENGOPAY_LICENSE_KEY') ?? '';
  const anon    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${license}`,
  };
  // When LINKY_LENGOPAY_BASE_URL points at our mock (Supabase gateway),
  // apikey is required for routing. Real Lengopay ignores apikey.
  if (anon) h['apikey'] = anon;
  return h;
}

export async function initPayment(req: LengopayInitRequest): Promise<LengopayInitResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/init-payment`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Lengopay init ${res.status}: ${await res.text()}`);
  return await res.json() as LengopayInitResponse;
}

export async function getPaymentStatus(payId: string): Promise<LengopayStatusResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/status/${encodeURIComponent(payId)}`, {
    method: 'GET', headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Lengopay status ${res.status}: ${await res.text()}`);
  return await res.json() as LengopayStatusResponse;
}
