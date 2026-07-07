import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { hmacHex } from '@shared/hmac.ts';
import { normalizePhone, normalizeEmail } from '@shared/validate.ts';

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
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_FROM');
  const canDeliverSms = !!twilioSid && !!twilioToken && !!twilioFrom;

  if (body.channel === 'phone' && canDeliverSms) {
    const params = new URLSearchParams({
      To: target,
      Body: `Linky : ton code de connexion est ${code}. Il expire dans 5 minutes.`,
    });
    // 'MG…' = Messaging Service SID ; anything else is treated as a From number.
    if (/^MG[0-9a-f]{32}$/i.test(twilioFrom!)) params.set('MessagingServiceSid', twilioFrom!);
    else params.set('From', twilioFrom!);
    try {
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        },
      );
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[otp-request] sms delivery failed:', r.status, detail.slice(0, 500));
        throwApi('OTP_DELIVERY_FAILED', 502, 'Envoi du code par SMS impossible. Réessaie plus tard.');
      }
      return { body: { otp_id: inserted.id } }; // no dev_code in real delivery
    } catch (e) {
      console.error('[otp-request] sms fetch threw:', e);
      throwApi('OTP_DELIVERY_FAILED', 502, 'Envoi du code par SMS impossible. Réessaie plus tard.');
    }
  }

  // Email via Resend — takes priority over the Gmail relay once BOTH
  // RESEND_API_KEY and RESEND_FROM are set. RESEND_FROM must be an address on
  // a domain verified in the Resend dashboard (e.g. 'Linky <no-reply@linky.gn>');
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
      return { body: { otp_id: inserted.id } }; // no dev_code in real delivery
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
      return { body: { otp_id: inserted.id } }; // no dev_code in real delivery
    } catch (e) {
      console.error('[otp-request] email fetch threw:', e);
      throwApi('OTP_DELIVERY_FAILED', 502,
        "Envoi du code par email impossible. Réessaie plus tard.");
    }
  }

  // Stub fallback: only for channels whose provider is NOT configured (phone
  // without Twilio secrets / email without the landing relay). Returns the
  // code in the response — test-phase only; dies as soon as secrets are set.
  console.log(`[OTP STUB] channel=${body.channel} target=${target} code=${code} otp_id=${inserted.id}`);
  return { body: { otp_id: inserted.id, dev_code: code } };
}));
