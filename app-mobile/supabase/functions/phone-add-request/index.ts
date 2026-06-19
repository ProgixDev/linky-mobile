// Pre-prod: request an OTP to verify ownership of a NEW phone before linking
// it to the caller's account. Mirrors otp-request's per-target rate limits
// (3/min, 10/day) so an attacker who steals a session can't burn through a
// victim's daily quota or spam a stranger's phone with codes.
//
// Phones are an auth surface (find_or_create_user_with_phone trusts the e164
// → user_id link), so an unverified-but-stored phone is an account-takeover
// path : adding the attacker's own phone to a victim's account would let the
// attacker later log in via OTP and resolve back to the victim's user_id.
// That is why this two-step flow exists at all and why phone-add-confirm
// requires a fresh, matching, unconsumed code under purpose='add_phone'.
//
// We DO check up-front whether the number is already linked to anyone (this
// caller or someone else) and refuse without burning an OTP slot — the user
// gets a clear error and the unique constraint stays the final guard at
// insert time anyway.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { normalizePhone } from '@shared/validate.ts';
import { hmacHex } from '@shared/hmac.ts';

interface Body { e164: string }
function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.e164 === 'string' && x.e164.length > 0 && x.e164.length <= 32;
}

const OTP_TTL_SEC = 300;
const PER_MINUTE = 3;
const PER_DAY = 10;

Deno.serve(makePost<Body>('/v1/phones/add-request', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const target = normalizePhone(body.e164);
  if (!target) throwApi('INVALID_TARGET', 400, 'Numéro invalide');

  // Already linked? — refuse with a precise error. Don't leak whether it
  // belongs to THIS user or someone else ; the same message covers both
  // ("ce numéro est déjà utilisé").
  const { data: existing, error: eExist } = await sb
    .from('phones')
    .select('user_id')
    .eq('e164', target)
    .maybeSingle();
  if (eExist) {
    console.error('[phone-add-request] phones lookup error:', eExist);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (existing) {
    throwApi('PHONE_ALREADY_LINKED', 409, 'Ce numéro est déjà utilisé.');
  }

  // Per-target rate-limit (same windows as otp-request so SMS pricing + abuse
  // posture stay identical across signin and phone-add).
  const now = Date.now();
  const sixtySecAgo = new Date(now - 60_000).toISOString();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
  const { count: minuteCount, error: e1 } = await sb
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('target', target)
    .gte('created_at', sixtySecAgo);
  if (e1) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if ((minuteCount ?? 0) >= PER_MINUTE) throwApi('OTP_RATE_LIMITED', 429, 'Trop de demandes. Réessaie dans une minute.');
  const { count: dayCount, error: e2 } = await sb
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('target', target)
    .gte('created_at', dayAgo);
  if (e2) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if ((dayCount ?? 0) >= PER_DAY) throwApi('OTP_RATE_LIMITED', 429, 'Limite quotidienne atteinte.');

  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const code = String(100000 + (arr[0] % 900000));
  const hmacSecret = Deno.env.get('LINKY_OTP_HMAC_SECRET');
  if (!hmacSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
  const code_hash = await hmacHex(hmacSecret, `${target}:${code}`);
  const expires_at = new Date(now + OTP_TTL_SEC * 1000).toISOString();

  // user_id is set on creation so the confirm step can refuse a swap : the
  // OTP code is only valid for the user who requested it. Two callers asking
  // for an OTP on the same number get two different codes ; only the
  // requester's session can verify their own.
  const { data: inserted, error: e3 } = await sb
    .from('otp_codes')
    .insert({ channel: 'phone', target, code_hash, purpose: 'add_phone', user_id: userId, expires_at })
    .select('id')
    .single();
  if (e3 || !inserted) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  // SMS delivery is not wired in V1 (memo project_phase_s_withdrawals : Orange
  // SMS + Twilio failover queued). Until then the dev_code stub echoes the code
  // to the client so the in-app paste flow works for the owner's test rounds —
  // gated to the SAME pre-prod posture as otp-request.
  console.log(`[OTP STUB add_phone] target=${target} code=${code} otp_id=${inserted.id}`);
  return { body: { otp_id: inserted.id, dev_code: code } };
}));
