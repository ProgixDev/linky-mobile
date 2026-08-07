// Delivering a 6-digit code to a PHONE — SMS first, WhatsApp second.
//
// Why WhatsApp exists here (client 2026-08-07): Guinean carriers reject any SMS
// whose alphanumeric sender was not pre-registered with them (Twilio error
// 30008), and registering "LINKY" runs through MTN + Orange approval. Buying a
// Guinean long code is not a way out either — Twilio does not offer them there.
// WhatsApp sidesteps the carriers entirely: Meta approves the sender, not MTN,
// and WhatsApp is the messaging default across Guinea. Same vendor, same API.
//
// Both rails are behind their own kill switch so either can be turned on or off
// from the dashboard with no redeploy:
//   LINKY_SMS_DELIVERY_ENABLED=0       → skip SMS      (currently 0)
//   LINKY_WHATSAPP_DELIVERY_ENABLED=0  → skip WhatsApp
import { throwApi } from './errors.ts';

export type PhoneDelivery = 'sms' | 'whatsapp';

/** Wording of the free-form message. Signing in vs. proving you own a number
 *  the account is about to be bound to — worth naming correctly, since the two
 *  reach the user in very different contexts. Ignored once an approved WhatsApp
 *  template is configured: Meta fixes that copy and it cannot be edited. */
export type CodeKind = 'signin' | 'verification';

function messageFor(kind: CodeKind, code: string): string {
  const what = kind === 'signin' ? 'code de connexion' : 'code de vérification';
  return `Linky : ton ${what} est ${code}. Il expire dans 5 minutes.`;
}

function twilioAuth(): { sid: string; token: string } | null {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  return sid && token ? { sid, token } : null;
}

async function postToTwilio(sid: string, token: string, params: URLSearchParams): Promise<void> {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    // Body carries the Twilio error code — the single most useful thing when a
    // send silently stops working (30008 = carrier reject, 63016 = no approved
    // template, 63007 = bad sender). Never log the code itself.
    throw new Error(`twilio ${r.status}: ${detail.slice(0, 500)}`);
  }
}

/** SMS. Returns false when the rail is off or unconfigured (caller falls through). */
export async function sendCodeBySms(to: string, code: string, kind: CodeKind = 'signin'): Promise<boolean> {
  const auth = twilioAuth();
  const from = Deno.env.get('TWILIO_FROM');
  if (!auth || !from) return false;
  if (Deno.env.get('LINKY_SMS_DELIVERY_ENABLED') === '0') return false;

  const params = new URLSearchParams({
    To: to,
    Body: messageFor(kind, code),
  });
  // 'MG…' = Messaging Service SID ; anything else is treated as a From number.
  if (/^MG[0-9a-f]{32}$/i.test(from)) params.set('MessagingServiceSid', from);
  else params.set('From', from);
  const statusCb = Deno.env.get('TWILIO_STATUS_CALLBACK_URL');
  if (statusCb) params.set('StatusCallback', statusCb);
  // Guinea (+224) is flagged high-risk for SMS-pumping, so Twilio's own fraud
  // filter was silently dropping EVERY signin code with error 30453. Disabling
  // RiskCheck is Twilio's documented fix for known-legitimate traffic, and ours
  // is: a code we generated, sent once to a number the user just typed, under a
  // 3/min + 10/day per-target limit.
  if (Deno.env.get('TWILIO_DISABLE_RISK_CHECK') !== '0') params.set('RiskCheck', 'disable');

  try {
    await postToTwilio(auth.sid, auth.token, params);
    return true;
  } catch (e) {
    console.error('[phone-code] sms delivery failed:', (e as Error).message);
    throwApi('OTP_DELIVERY_FAILED', 502, 'Envoi du code par SMS impossible. Réessaie plus tard.');
  }
}

/** WhatsApp. Returns false when the rail is off or unconfigured. */
export async function sendCodeByWhatsapp(to: string, code: string, kind: CodeKind = 'signin'): Promise<boolean> {
  const auth = twilioAuth();
  const rawFrom = Deno.env.get('TWILIO_WHATSAPP_FROM');
  if (!auth || !rawFrom) return false;
  if (Deno.env.get('LINKY_WHATSAPP_DELIVERY_ENABLED') === '0') return false;

  // Accept the number with or without the prefix — 'whatsapp:+14155238886' and
  // '+14155238886' both work, so a copy-paste from the Twilio console can't
  // silently produce 'whatsapp:whatsapp:+…'.
  const withPrefix = (n: string) => (n.startsWith('whatsapp:') ? n : `whatsapp:${n}`);
  const params = new URLSearchParams({ From: withPrefix(rawFrom), To: withPrefix(to) });

  // A business-initiated WhatsApp message outside the 24h customer-service
  // window MUST use an approved template, so production needs
  // TWILIO_WHATSAPP_CONTENT_SID (an authentication template, HX…). Without it we
  // fall back to a plain body, which is what the Twilio sandbox accepts — that
  // is the cheap way to prove delivery to a Guinean number before committing to
  // the Meta onboarding. Sending free-form on a real sender fails with 63016.
  const contentSid = Deno.env.get('TWILIO_WHATSAPP_CONTENT_SID');
  if (contentSid) {
    params.set('ContentSid', contentSid);
    // Authentication templates take the code as variable {{1}}; the copy-code
    // button reuses the same value, so one variable covers both.
    params.set('ContentVariables', JSON.stringify({ '1': code }));
  } else {
    params.set('Body', messageFor(kind, code));
  }
  const statusCb = Deno.env.get('TWILIO_STATUS_CALLBACK_URL');
  if (statusCb) params.set('StatusCallback', statusCb);

  try {
    await postToTwilio(auth.sid, auth.token, params);
    return true;
  } catch (e) {
    console.error('[phone-code] whatsapp delivery failed:', (e as Error).message);
    throwApi('OTP_DELIVERY_FAILED', 502, 'Envoi du code par WhatsApp impossible. Réessaie plus tard.');
  }
}

/**
 * Try every phone rail in order and report which one carried the code.
 * null => nothing is configured; the caller must fail closed rather than
 * hand the code back in the response.
 */
export async function sendCodeToPhone(
  to: string,
  code: string,
  kind: CodeKind = 'signin',
): Promise<PhoneDelivery | null> {
  if (await sendCodeBySms(to, code, kind)) return 'sms';
  if (await sendCodeByWhatsapp(to, code, kind)) return 'whatsapp';
  return null;
}
