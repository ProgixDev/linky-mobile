// Phase P.2 — Didit hosted-KYC client. Concept ported from getdraft's
// didit.service.ts, adapted to Deno + Linky conventions.
//
// Flow : kyc-start creates a hosted session (vendor_data = our user id),
// the app opens session.url in an in-app browser, Didit runs ID scan +
// selfie + liveness, then POSTs the decision to didit-webhook (HMAC-SHA256
// signed) and redirects the browser to our kyc-callback page. kyc-status
// polls as the safety net for missed webhooks.
//
// Secrets : LINKY_DIDIT_API_KEY, LINKY_DIDIT_WORKFLOW_ID,
// LINKY_DIDIT_WEBHOOK_SECRET. When unset, kyc-start returns
// KYC_NOT_CONFIGURED (503) — the app shows "bientôt disponible" instead of
// breaking, so deploys don't depend on credential timing.

import type { SupabaseClient } from '@shared/db.ts';
import { hmacHex, timingSafeEqual } from '@shared/hmac.ts';
import { notifyDetached } from '@shared/push.ts';

const DIDIT_API_BASE = 'https://verification.didit.me/v2';

export type DiditSessionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Abandoned'
  | 'Expired';

export type KycStatus = 'pending' | 'in_review' | 'approved' | 'declined' | 'expired';

export interface DiditCreateSessionResponse {
  session_id: string;
  url: string;
  status: DiditSessionStatus;
  workflow_id?: string;
  expires_at?: string;
}

export interface DiditDecisionResponse {
  session_id: string;
  status: DiditSessionStatus;
  vendor_data?: string | null;
  [key: string]: unknown;
}

export function diditConfig(): { apiKey: string; workflowId: string } | null {
  const apiKey = Deno.env.get('LINKY_DIDIT_API_KEY');
  const workflowId = Deno.env.get('LINKY_DIDIT_WORKFLOW_ID');
  if (!apiKey || !workflowId) return null;
  return { apiKey, workflowId };
}

export async function createDiditSession(vendorData: string, callbackUrl: string): Promise<DiditCreateSessionResponse> {
  const cfg = diditConfig();
  if (!cfg) throw new Error('didit_not_configured');
  const res = await fetch(`${DIDIT_API_BASE}/session/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ workflow_id: cfg.workflowId, vendor_data: vendorData, callback: callbackUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[didit] createSession ${res.status}:`, text.slice(0, 300));
    throw new Error('didit_session_failed');
  }
  return JSON.parse(text) as DiditCreateSessionResponse;
}

export async function getDiditDecision(sessionId: string): Promise<DiditDecisionResponse> {
  const cfg = diditConfig();
  if (!cfg) throw new Error('didit_not_configured');
  const res = await fetch(`${DIDIT_API_BASE}/session/${encodeURIComponent(sessionId)}/decision/`, {
    headers: { 'x-api-key': cfg.apiKey },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[didit] getDecision ${res.status}:`, text.slice(0, 300));
    throw new Error('didit_decision_failed');
  }
  return JSON.parse(text) as DiditDecisionResponse;
}

/** Map Didit's status strings → our compact internal enum. */
export function normalizeDiditStatus(status: DiditSessionStatus | undefined): KycStatus {
  switch (status) {
    case 'Approved': return 'approved';
    case 'Declined': return 'declined';
    case 'In Review': return 'in_review';
    case 'Expired':
    case 'Abandoned': return 'expired';
    default: return 'pending';
  }
}

/** HMAC-SHA256 over the RAW request body, hex, timing-safe compare. */
export async function verifyDiditSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('LINKY_DIDIT_WEBHOOK_SECRET');
  if (!secret) {
    // Fail closed, but say WHY — without this secret every webhook 401s and
    // only the kyc-status poll safety-net keeps decisions flowing.
    console.error('[didit] LINKY_DIDIT_WEBHOOK_SECRET unset — webhook rejected');
    return false;
  }
  if (!signature) return false;
  const expected = await hmacHex(secret, rawBody);
  return timingSafeEqual(expected, signature.toLowerCase());
}

const KNOWN_DIDIT_STATUSES: ReadonlySet<string> = new Set([
  'Not Started', 'In Progress', 'In Review', 'Approved', 'Declined', 'Abandoned', 'Expired',
]);

/** Didit statuses we don't recognize must be ignored, never coerced to 'pending'. */
export function isKnownDiditStatus(status: unknown): status is DiditSessionStatus {
  return typeof status === 'string' && KNOWN_DIDIT_STATUSES.has(status);
}

// Single decision-application path shared by webhook, poll safety-net and
// admin manual override — the only place that mutates kyc state.
//
//   1. kyc_sessions row : status / decision / completed_at / decided_via.
//      GUARDED : only OPEN sessions (pending / in_review) accept a write.
//      Late Didit retries, out-of-order webhooks and the mobile 2.5s poll
//      must never demote a terminal or admin-made decision — a closed
//      session makes this a 'noop'.
//   2. users mirror     : kyc_status (+ kyc_completed_at on approve/decline ;
//                         'expired' resets the mirror to 'none' for retry,
//                         WITHOUT a completion timestamp).
//      GUARDED : nothing but an 'approved' write may overwrite an 'approved'
//      mirror — an orphaned duplicate session expiring must not strip a
//      user's approval.
//   3. on approve       : flip shops.verified for the user's shops
//                         ("Vendeur vérifié" badge — V1 decision : identity
//                         approval IS shop verification ; revisit if the
//                         client wants a separate manual step)
//   4. terminal push    : approved / declined notification (Phase O infra)
//
// Returns the applied status, or : 'noop' (session exists but is closed —
// callers ack and move on), 'unknown' (no such session — ack, likely
// cross-env vendor traffic), 'error' (DB failure — webhook returns 500 so
// Didit RETRIES instead of dropping the decision).
export type ApplyKycResult = KycStatus | 'noop' | 'unknown' | 'error';

export async function applyKycDecision(
  sb: SupabaseClient,
  diditSessionId: string,
  rawStatus: DiditSessionStatus | undefined,
  decision: Record<string, unknown> | null,
  decidedVia: string,
): Promise<ApplyKycResult> {
  const status = normalizeDiditStatus(rawStatus);
  const terminal = status === 'approved' || status === 'declined' || status === 'expired';

  const { data: session, error: sessErr } = await sb
    .from('kyc_sessions')
    .update({
      status,
      // null means "keep the stored Didit payload" : JSON.stringify drops
      // undefined-valued keys in the PATCH body (verified on supabase-js
      // 2.45), so the column is untouched. Do NOT "simplify" to
      // `decision: decision` — that would wipe it with SQL null.
      decision: decision ?? undefined,
      decided_via: decidedVia,
      updated_at: new Date().toISOString(),
      completed_at: terminal ? new Date().toISOString() : null,
    })
    .eq('didit_session_id', diditSessionId)
    .in('status', ['pending', 'in_review'])
    .select('user_id, status')
    .maybeSingle();
  if (sessErr) {
    console.error('[didit] session update failed:', sessErr);
    return 'error';
  }
  if (!session) {
    const { data: existing, error: exErr } = await sb
      .from('kyc_sessions')
      .select('status')
      .eq('didit_session_id', diditSessionId)
      .maybeSingle();
    if (exErr) {
      console.error('[didit] session existence check failed:', exErr);
      return 'error';
    }
    if (existing) {
      console.log(`[didit] ${decidedVia} decision ignored — session already ${existing.status}`);
      return 'noop';
    }
    console.error('[didit] decision for unknown session:', diditSessionId);
    return 'unknown';
  }

  const userId = session.user_id as string;
  const mirror = status === 'expired' ? 'none' : status;
  let userUpdate = sb
    .from('users')
    .update({
      kyc_status: mirror,
      ...(status === 'approved' || status === 'declined' ? { kyc_completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', userId);
  // Approval is sticky : only another approval may overwrite it.
  if (mirror !== 'approved') userUpdate = userUpdate.neq('kyc_status', 'approved');
  const { error: userErr } = await userUpdate;
  if (userErr) console.error('[didit] users mirror update failed:', userErr);

  if (status === 'approved') {
    const { error: shopErr } = await sb.from('shops').update({ verified: true }).eq('owner_id', userId);
    if (shopErr) console.error('[didit] shops.verified flip failed:', shopErr);
  }

  if (status === 'approved' || status === 'declined') {
    notifyDetached(sb, {
      userIds: [userId],
      category: 'system',
      title: status === 'approved' ? 'Identité vérifiée' : 'Vérification non aboutie',
      body:
        status === 'approved'
          ? 'Ton compte est vérifié — ta boutique porte maintenant le badge « Vendeur vérifié ».'
          : "La vérification n'a pas abouti. Tu peux réessayer depuis ton profil.",
      iconHint: status === 'approved' ? 'check' : 'shield',
      deeplink: '/profil',
    });
  }

  return status;
}
