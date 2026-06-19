// Pre-prod: confirm the OTP from phone-add-request and link the verified phone
// to the caller's account. Mirrors otp-verify's atomic consumption pattern
// (increment_otp_attempts + .is('consumed_at', null) update) so racing two
// verify attempts with the same code can't double-insert the phone.
//
// CRITICAL: the OTP we verify here MUST carry purpose='add_phone' AND user_id
// matching the authenticated caller. Without those two binds a stolen
// signin-purpose code could be used to link arbitrary phones, and a code
// issued for user A could be replayed by user B. Both are account-takeover
// vectors on a phone identity that doubles as a login method.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { hmacHex, timingSafeEqual } from '@shared/hmac.ts';
import { detectCarrier } from '@shared/validate.ts';

interface Body { otp_id: string; code: string }
function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.otp_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.otp_id)
    && typeof x.code === 'string' && /^\d{6}$/.test(x.code);
}

const MAX_ATTEMPTS = 5;

Deno.serve(makePost<Body>('/v1/phones/add-confirm', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: otp, error: eOtp } = await sb
    .from('otp_codes')
    .select('id, channel, target, code_hash, purpose, attempts, expires_at, consumed_at, user_id')
    .eq('id', body.otp_id)
    .maybeSingle();
  if (eOtp) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!otp) throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  if (otp.purpose !== 'add_phone' || otp.channel !== 'phone') {
    // Wrong-purpose / wrong-channel OTPs from another flow must not link a
    // phone. Treat as a generic "not found" so we don't surface internal
    // purpose names to the caller.
    throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  }
  if (otp.user_id !== userId) {
    // The code was issued for a different session — refuse without leaking
    // identity. Two callers asking for an OTP on the same number get two
    // codes ; this hardens against the "I made you ask, now I verify" replay.
    throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  }
  if (otp.consumed_at) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');
  if (new Date(otp.expires_at).getTime() <= Date.now()) throwApi('OTP_EXPIRED', 410, 'Code expiré');
  if (otp.attempts >= MAX_ATTEMPTS) throwApi('OTP_TOO_MANY_ATTEMPTS', 429, 'Trop de tentatives');

  const hmacSecret = Deno.env.get('LINKY_OTP_HMAC_SECRET');
  if (!hmacSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
  const expected = await hmacHex(hmacSecret, `${otp.target}:${body.code}`);
  if (!timingSafeEqual(expected, otp.code_hash)) {
    await sb.rpc('increment_otp_attempts', { p_otp_id: otp.id });
    throwApi('OTP_INVALID', 401, 'Code incorrect');
  }

  // Atomic consumption — second concurrent verify finds no row and bails.
  const { data: consumed, error: eCons } = await sb
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otp.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (eCons) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!consumed) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');

  // Final insert. The e164 UNIQUE constraint is the last line of defense:
  // even if two confirms race past the add-request "already linked" check
  // with different codes for the same number, only one can win.
  const { data: row, error: eIns } = await sb
    .from('phones')
    .insert({
      user_id: userId,
      e164: otp.target,
      carrier: detectCarrier(otp.target),
      is_primary: false, // never auto-primary ; set-primary is a separate explicit action
      verified_at: new Date().toISOString(),
    })
    .select('id, e164, carrier, is_primary, verified_at, created_at')
    .single();
  if (eIns || !row) {
    if ((eIns as { code?: string } | null)?.code === '23505') {
      throwApi('PHONE_ALREADY_LINKED', 409, 'Ce numéro est déjà utilisé.');
    }
    console.error('[phone-add-confirm] insert error:', eIns);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return {
    body: {
      phone: {
        id: row.id,
        e164: row.e164,
        carrier: row.carrier,
        is_primary: row.is_primary,
        verified: row.verified_at !== null,
        created_at: row.created_at,
      },
    },
  };
}));
