import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { hmacHex } from '@shared/hmac.ts';
import { normalizePhone, normalizeEmail } from '@shared/validate.ts';
import { sendCodeToPhone, PRELUDE_CODE_SENTINEL } from '@shared/phone-code.ts';

interface Body { channel: 'phone' | 'email'; target: string; purpose: 'signin'; app?: 'driver' | 'marketplace' }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && (x.channel === 'phone' || x.channel === 'email')
    && typeof x.target === 'string' && x.target.length > 0
    && x.purpose === 'signin'
    && (x.app === undefined || x.app === 'driver' || x.app === 'marketplace');
}

const OTP_TTL_SEC = 300;
const PER_MINUTE = 3;
const PER_DAY = 10;

Deno.serve(makePost<Body>('/v1/otp/request', valid, async ({ sb, body }) => {
  const target = body.channel === 'phone' ? normalizePhone(body.target) : normalizeEmail(body.target);
  if (!target) throwApi('INVALID_TARGET', 400, body.channel === 'phone' ? 'Numéro invalide' : 'Email invalide');

  // Driver app: a Linky MARKETPLACE email (client / vendeur / agent) cannot also be a
  // livreur — driver and customer accounts are kept separate. Refuse BEFORE sending any
  // OTP so the user gets a clear instruction, not a code. A brand-new email (no account)
  // passes through; a `driver`-origin account passes through (existing livreur re-login).
  if (body.app === 'driver' && body.channel === 'email') {
    const { data: emailRow } = await sb.from('emails').select('user_id').eq('address', target).maybeSingle();
    if (emailRow?.user_id) {
      const { data: u } = await sb.from('users').select('origin_app').eq('id', emailRow.user_id).maybeSingle();
      if (u && (u as { origin_app?: string }).origin_app !== 'driver') {
        throwApi('EMAIL_IN_MARKETPLACE', 409,
          'Cet email est déjà utilisé sur l’app Linky (client / vendeur). Tu ne peux pas être à la fois client et livreur — utilise une autre adresse email pour ton compte livreur.');
      }
    }
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

  const { data: inserted, error: e3 } = await sb
    .from('otp_codes')
    .insert({ channel: body.channel, target, code_hash, purpose: body.purpose, expires_at })
    .select('id')
    .single();
  if (e3 || !inserted) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  // Email delivery: when LANDING_OTP_URL + OTP_EMAIL_SECRET are set, POST the code to
  // the landing's /api/send-otp transactional endpoint.
  // Phone delivery: when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM are set,
  // send a real SMS via Twilio (TWILIO_FROM is either an E.164 number or a Messaging
  // Service SID 'MG…'). Unconfigured channels fall through to the dev_code stub —
  // setting the Twilio secrets flips phone signup to real delivery with no redeploy.
  const landingUrl = Deno.env.get('LANDING_OTP_URL');
  const emailSecret = Deno.env.get('OTP_EMAIL_SECRET');
  const canDeliverEmail = !!landingUrl && !!emailSecret;

  // Phone: SMS first, then WhatsApp. Guinean carriers reject our SMS until the
  // "LINKY" sender is registered with them, so WhatsApp is what actually
  // delivers today — see @shared/phone-code.ts for the full reasoning and the
  // two kill switches. `delivery` goes back to the app so the code screen can
  // say WhatsApp instead of SMS ; otherwise people stare at their messages app
  // waiting for something that arrived elsewhere.
  if (body.channel === 'phone') {
    const sent = await sendCodeToPhone(target, code);
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
          console.error('[otp-request] could not mark otp as prelude-verified:', eMark);
          throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
        }
      }
      return { body: { otp_id: inserted.id, delivery: sent.delivery } }; // no dev_code in real delivery
    }
  }

  // Email via Resend — takes priority over the Gmail relay once BOTH
  // RESEND_API_KEY and RESEND_FROM are set. RESEND_FROM must be an address on
  // a domain verified in the Resend dashboard (e.g. 'Linky <no-reply@linkygroup.com>');
  // setting it before verification would break delivery, so the switch is
  // deliberately gated on that second variable.
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM');
  if (body.channel === 'email' && resendKey && resendFrom) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [target],
          subject: `${code} — ton code de connexion Linky`,
          html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
            <h2 style="color:#0A5240;margin:0 0 8px">Linky</h2>
            <p>Ton code de connexion :</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
            <p style="color:#666">Il expire dans 5 minutes. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
          </div>`,
        }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[otp-request] resend delivery failed:', r.status, detail.slice(0, 400));
        throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code par email impossible. Réessaie plus tard.");
      }
      return { body: { otp_id: inserted.id, delivery: 'email' } }; // no dev_code in real delivery
    } catch (e) {
      console.error('[otp-request] resend fetch threw:', e);
      throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code par email impossible. Réessaie plus tard.");
    }
  }

  if (body.channel === 'email' && canDeliverEmail) {
    try {
      const r = await fetch(`${landingUrl}/api/send-otp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-otp-secret': emailSecret,
        },
        body: JSON.stringify({ to: target, code }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[otp-request] email delivery failed:', r.status, detail);
        throwApi('OTP_DELIVERY_FAILED', 502,
          "Envoi du code par email impossible. Réessaie plus tard.");
      }
      return { body: { otp_id: inserted.id, delivery: 'email' } }; // no dev_code in real delivery
    } catch (e) {
      console.error('[otp-request] email fetch threw:', e);
      throwApi('OTP_DELIVERY_FAILED', 502,
        "Envoi du code par email impossible. Réessaie plus tard.");
    }
  }

  // Provider for this channel is NOT configured (phone without Twilio secrets /
  // email without any relay). We must FAIL CLOSED: otp-request is a public,
  // unauthenticated endpoint with no ownership check on `target`, so returning
  // the code in the response would let anyone request an OTP for someone else's
  // phone/email and read it straight back — full account takeover (audit
  // AUTH-01 / SEC-01). The code is NEVER put in the response or the logs in
  // production. A pre-prod echo is available ONLY when the deploy explicitly
  // sets LINKY_DEV_OTP_ECHO=1 (which must stay unset in prod).
  if (Deno.env.get('LINKY_DEV_OTP_ECHO') === '1') {
    console.log(`[OTP DEV ECHO] channel=${body.channel} otp_id=${inserted.id}`);
    return { body: { otp_id: inserted.id, dev_code: code } };
  }
  throwApi('OTP_DELIVERY_UNAVAILABLE', 503,
    body.channel === 'phone'
      ? "L'envoi de SMS n'est pas encore activé. Connecte-toi plutôt par email."
      : "L'envoi du code par email est momentanément indisponible. Réessaie plus tard.");
}));
