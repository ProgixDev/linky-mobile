// Step-up verification before a password change (client 2026-08-05).
//
// Profil -> Mot de passe lets a signed-in session set a new password. A
// signin session alone isn't proof enough for that : sessions live 90 days,
// so a lost/borrowed unlocked phone could otherwise let anyone lock the real
// owner out by setting a new password with zero further check. Requiring a
// fresh OTP on the account's OWN registered email or phone closes that gap —
// same "something you have right now" bar as adding a phone number
// (phone-add-request/confirm), reusing that exact pattern.
//
// CRITICAL: the target is resolved SERVER-SIDE from the caller's own
// emails/phones rows — never client-supplied — so this can only ever send a
// code to a contact method the account actually owns.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { sendCodeToPhone, PRELUDE_CODE_SENTINEL } from '@shared/phone-code.ts';
import { requireUser } from '@shared/auth.ts';
import { hmacHex } from '@shared/hmac.ts';

interface Body { channel: 'email' | 'phone' }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && (x.channel === 'email' || x.channel === 'phone');
}

const OTP_TTL_SEC = 300;
const PER_MINUTE = 3;
const PER_DAY = 10;

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const masked = local.length <= 1 ? local : local[0] + '•'.repeat(Math.min(local.length - 1, 6));
  return `${masked}${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, phone.length - 4) + '••' + phone.slice(-2);
}

Deno.serve(makePost<Body>('/v1/auth/password-change-request', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Resolve the target SERVER-SIDE — the caller's own verified contact for
  // the requested channel, preferring the primary one. Never trust a
  // client-supplied address/number for this.
  const table = body.channel === 'email' ? 'emails' : 'phones';
  const column = body.channel === 'email' ? 'address' : 'e164';
  const { data: rows, error: eLookup } = await sb
    .from(table)
    .select(column)
    .eq('user_id', userId)
    .not('verified_at', 'is', null)
    .order('is_primary', { ascending: false })
    .limit(1);
  if (eLookup) {
    console.error('[password-change-request] lookup error:', eLookup);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const row = (rows as Record<string, string>[] | null)?.[0];
  const target = row?.[column];
  if (!target) {
    throwApi(
      'NO_CONTACT_METHOD',
      400,
      body.channel === 'email'
        ? "Aucun email vérifié sur ce compte."
        : "Aucun numéro vérifié sur ce compte.",
    );
  }

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

  // user_id-scoped, like phone-add-request : only THIS session can confirm
  // with this code, and password-change-confirm re-checks purpose + user_id.
  const { data: inserted, error: e3 } = await sb
    .from('otp_codes')
    .insert({ channel: body.channel, target, code_hash, purpose: 'password_change', user_id: userId, expires_at })
    .select('id')
    .single();
  if (e3 || !inserted) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  if (body.channel === 'phone') {
    // Phone rails live in @shared/phone-code.ts (Prelude first, then Twilio
    // SMS). Still FAILS CLOSED when neither rail is configured — see the
    // header on why the code must never come back in the response.
    const sent = await sendCodeToPhone(target, code, 'verification');
    if (sent) {
      if (sent.verifier === 'prelude') {
        // Prelude generated this code, so our HMAC is meaningless for it —
        // stamp the row so the confirm step knows to ask Prelude instead. Fail
        // the request if the stamp cannot be written: the alternative is a user
        // holding a valid code against a row that will never accept it.
        const { error: eMark } = await sb
          .from('otp_codes')
          .update({ code_hash: PRELUDE_CODE_SENTINEL })
          .eq('id', inserted.id);
        if (eMark) {
          console.error('[password-change-request] could not mark otp as prelude-verified:', eMark);
          throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
        }
      }
      return { body: { otp_id: inserted.id, target_masked: maskPhone(target), delivery: sent.delivery } };
    }
    if (Deno.env.get('LINKY_DEV_OTP_ECHO') === '1') {
      return { body: { otp_id: inserted.id, target_masked: maskPhone(target), dev_code: code } };
    }
    throwApi('OTP_DELIVERY_UNAVAILABLE', 503, "L'envoi du code par téléphone n'est pas encore activé.");
  }

  // channel === 'email'
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM');
  if (resendKey && resendFrom) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: resendFrom,
          to: [target],
          subject: `${code} — confirme le changement de mot de passe Linky`,
          html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
            <h2 style="color:#0A5240;margin:0 0 8px">Linky</h2>
            <p>Code pour confirmer le changement de ton mot de passe :</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
            <p style="color:#666">Il expire dans 5 minutes. Si tu n'es pas à l'origine de cette demande, ignore cet email et ton mot de passe restera inchangé.</p>
          </div>`,
        }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[password-change-request] resend delivery failed:', r.status, detail.slice(0, 400));
        throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code par email impossible. Réessaie plus tard.");
      }
      return { body: { otp_id: inserted.id, target_masked: maskEmail(target) } };
    } catch (e) {
      console.error('[password-change-request] resend fetch threw:', e);
      throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code par email impossible. Réessaie plus tard.");
    }
  }
  const landingUrl = Deno.env.get('LANDING_OTP_URL');
  const emailSecret = Deno.env.get('OTP_EMAIL_SECRET');
  if (landingUrl && emailSecret) {
    try {
      const r = await fetch(`${landingUrl}/api/send-otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-otp-secret': emailSecret },
        body: JSON.stringify({ to: target, code }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[password-change-request] email delivery failed:', r.status, detail);
        throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code par email impossible. Réessaie plus tard.");
      }
      return { body: { otp_id: inserted.id, target_masked: maskEmail(target) } };
    } catch (e) {
      console.error('[password-change-request] email fetch threw:', e);
      throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code par email impossible. Réessaie plus tard.");
    }
  }
  if (Deno.env.get('LINKY_DEV_OTP_ECHO') === '1') {
    return { body: { otp_id: inserted.id, target_masked: maskEmail(target), dev_code: code } };
  }
  throwApi('OTP_DELIVERY_UNAVAILABLE', 503, "L'envoi du code par email est momentanément indisponible.");
}));
