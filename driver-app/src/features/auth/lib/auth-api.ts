import { z } from 'zod';

import { ApiError, apiPost } from '@/shared/lib/api';

import {
  AuthBundleSchema,
  AuthUserSchema,
  OtpRequestResponseSchema,
  TokenBundleSchema,
  type AuthBundle,
  type AuthUser,
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
    case 'OTP_DELIVERY_UNAVAILABLE':
      return 'delivery_failed';
    default:
      return 'error';
  }
}

/**
 * Codes dont le message du serveur ne doit PAS etre montre tel quel.
 *
 * OTP_DELIVERY_UNAVAILABLE dit, pour le canal telephone : « L'envoi de SMS
 * n'est pas encore active. Connecte-toi plutot par email. » (otp-request/
 * index.ts:220-223). Cette phrase est juste pour le marketplace, qui a toujours
 * un ecran e-mail — elle est IMPOSSIBLE A SUIVRE ici depuis que Depose ne
 * propose plus que le telephone. On lui substitue notre propre texte.
 *
 * Corriger le serveur aurait touche les deux applications ; le defaut n'existe
 * que du cote ou l'e-mail a disparu, donc le correctif vit ici.
 */
const IGNORE_SERVER_MESSAGE: ReadonlySet<string> = new Set(['OTP_DELIVERY_UNAVAILABLE']);

function mapError(e: unknown): { kind: OtpErrorKind; message: string } {
  if (e instanceof ApiError) {
    const kind = kindForCode(e.status, e.code);
    if (IGNORE_SERVER_MESSAGE.has(e.code)) return { kind, message: FALLBACK[kind] };
    return { kind, message: e.message_fr || FALLBACK[kind] };
  }
  return { kind: 'error', message: FALLBACK.error };
}

/**
 * Demande un code par TELEPHONE. Rend l'otp_id (et un dev_code en mode stub).
 *
 * `phone` doit deja etre en E.164 — GnPhoneSchema s'en charge dans le store.
 *
 * On garde `app: 'driver'` : le serveur s'en sert pour marquer origin_app sur
 * un compte NEUF. Le garde « deja client Linky » qu'il porte est, lui, limite
 * au canal e-mail, donc un numero deja connu du marketplace passe et ouvre la
 * session sur CE compte-la — exactement ce que le client a demande.
 */
export async function requestOtp({ phone }: { phone: string }): Promise<OtpRequestResult> {
  try {
    const data = await apiPost<unknown>({
      path: '/otp-request',
      authed: false,
      body: { channel: 'phone', target: phone, purpose: 'signin', app: 'driver' },
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
      body: { otp_id: otpId, code, app: 'driver' },
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

export type ProfilePatch = {
  display_name?: string;
  city?: string;
  avatar_url?: string;
  roles?: string[];
};

/**
 * Update the signed-in courier's profile (display_name / city / avatar_url) via the
 * shared `update-profile` endpoint. AUTHED. Throws ApiError on failure (the store maps
 * it). Returns the fresh user; the response is Zod-validated at this trust boundary.
 */
export async function updateProfile(patch: ProfilePatch): Promise<AuthUser> {
  const data = await apiPost<unknown>({ path: '/update-profile', body: patch });
  const parsed = z.object({ user: AuthUserSchema }).safeParse(data);
  if (!parsed.success) throw new Error('Réponse de profil invalide.');
  return parsed.data.user;
}
