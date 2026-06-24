import { ApiError, apiPost } from '@/shared/lib/api';

import {
  AuthBundleSchema,
  OtpRequestResponseSchema,
  TokenBundleSchema,
  type AuthBundle,
  type OtpErrorKind,
  type TokenBundle,
} from '../model/schema';

/**
 * Linky OTP auth client. Mirrors the parent app's request/verify/refresh contract
 * (app-mobile/src/data/queries/auth.ts) but maps every backend error code onto a
 * closed {@link OtpErrorKind} union so the UI never branches on a raw string.
 *
 * Auth is the Linky SELF-ROLLED JWT, so these call the edge functions UNAUTHED
 * (`authed: false`) — the access token doesn't exist yet. All responses are
 * Zod-validated at this network trust boundary.
 */

export type OtpRequestResult =
  | { ok: true; otpId: string; devCode?: string }
  | { ok: false; kind: OtpErrorKind; message: string };

export type OtpVerifyResult =
  | { ok: true; bundle: AuthBundle }
  | { ok: false; kind: OtpErrorKind; message: string };

// Default French copy when the server didn't attach a message_fr (it almost always does).
const FALLBACK: Record<OtpErrorKind, string> = {
  rate_limited: 'Trop de demandes. Réessaie dans un instant.',
  too_many_attempts: 'Trop de tentatives. Demande un nouveau code.',
  invalid: 'Code incorrect.',
  expired: 'Ce code a expiré. Demande un nouveau code.',
  not_found: 'Code introuvable ou expiré.',
  delivery_failed: 'Envoi du code impossible. Réessaie plus tard.',
  offline: 'Connexion impossible. Vérifie ta connexion.',
  error: 'Une erreur est survenue. Réessaie.',
};

// Backend error code → typed kind. A transport failure surfaces as ApiError(0,
// NETWORK_ERROR) from the api layer → offline.
function kindForCode(status: number, code: string): OtpErrorKind {
  if (status === 0 || code === 'NETWORK_ERROR') return 'offline';
  switch (code) {
    case 'OTP_RATE_LIMITED':
      return 'rate_limited';
    case 'OTP_TOO_MANY_ATTEMPTS':
      return 'too_many_attempts';
    case 'OTP_INVALID':
      return 'invalid';
    case 'OTP_EXPIRED':
    case 'OTP_ALREADY_USED':
      return 'expired';
    case 'OTP_NOT_FOUND':
      return 'not_found';
    case 'OTP_DELIVERY_FAILED':
      return 'delivery_failed';
    default:
      return 'error';
  }
}

function mapError(e: unknown): { kind: OtpErrorKind; message: string } {
  if (e instanceof ApiError) {
    const kind = kindForCode(e.status, e.code);
    return { kind, message: e.message_fr || FALLBACK[kind] };
  }
  return { kind: 'error', message: FALLBACK.error };
}

/** Request an email OTP. Returns the otp_id (and a dev_code in stub mode). */
export async function requestOtp({ email }: { email: string }): Promise<OtpRequestResult> {
  try {
    const data = await apiPost<unknown>({
      path: '/otp-request',
      authed: false,
      body: { channel: 'email', target: email, purpose: 'signin' },
    });
    const parsed = OtpRequestResponseSchema.safeParse(data);
    if (!parsed.success) return { ok: false, kind: 'error', message: FALLBACK.error };
    return { ok: true, otpId: parsed.data.otp_id, devCode: parsed.data.dev_code };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

/** Verify the 6-digit code → the self-rolled JWT bundle (or a typed failure). */
export async function verifyOtp({
  otpId,
  code,
}: {
  otpId: string;
  code: string;
}): Promise<OtpVerifyResult> {
  try {
    const data = await apiPost<unknown>({
      path: '/otp-verify',
      authed: false,
      body: { otp_id: otpId, code },
    });
    const parsed = AuthBundleSchema.safeParse(data);
    if (!parsed.success) return { ok: false, kind: 'error', message: FALLBACK.error };
    return { ok: true, bundle: parsed.data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

/**
 * Rotate the session via `session-refresh`. Throws on transport/invalid token (the
 * caller — the auth store's boot path — treats any throw as "signed out"). The
 * response is Zod-validated so a malformed body can never masquerade as a session.
 */
export async function refreshSession(refreshToken: string): Promise<TokenBundle> {
  const data = await apiPost<unknown>({
    path: '/session-refresh',
    authed: false,
    body: { refresh_token: refreshToken },
  });
  return TokenBundleSchema.parse(data);
}
