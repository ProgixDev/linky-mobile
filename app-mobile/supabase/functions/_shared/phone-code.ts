// Delivering a 6-digit code to a PHONE — Prelude first, then Twilio SMS, then
// Twilio WhatsApp.
//
// The problem all of this exists for: Guinean carriers reject any SMS whose
// alphanumeric sender was not pre-registered WITH THEM (Twilio error 30008 —
// proven on six sends, 100 % undelivered). Registering "LINKY" runs through MTN
// + Orange approval, and buying a Guinean long code is not a way out either:
// Twilio does not offer them there, and MTN refuses numeric senders outright.
//
// Prelude (client 2026-08-07) is an OTP-only provider that **operates the sender
// registrations itself** across 230+ countries and falls back between channels
// on its own (WhatsApp → SMS). That is precisely the work we are otherwise
// blocked on, which is why it goes FIRST when configured.
//
// We keep generating and verifying our own code and merely ask Prelude to
// deliver it (`custom_code`). Handing verification to Prelude as well would mean
// rewiring otp-verify, phone-add-confirm and password-change-confirm — all of
// which already carry hardening (HMAC-at-rest, per-target rate limits, purpose
// scoping, user_id binding). Not worth reopening before launch. The cost of that
// choice: no Prelude anti-fraud scoring or silent verification for now.
//
// Twilio WhatsApp stays as a hand-rolled fallback for the case where Prelude is
// unavailable; Meta approves that sender, not MTN, so it also bypasses the
// carriers.
//
// Every rail has its own kill switch — flip one from the dashboard, no redeploy:
//   LINKY_PRELUDE_DELIVERY_ENABLED=0   → skip Prelude
//   LINKY_SMS_DELIVERY_ENABLED=0       → skip Twilio SMS  (currently 0)
//   LINKY_WHATSAPP_DELIVERY_ENABLED=0  → skip Twilio WhatsApp
import { throwApi } from './errors.ts';
import { hmacHex, timingSafeEqual } from './hmac.ts';

/** Which rail actually carried the code. Prelude picks between SMS and WhatsApp
 *  itself, so we read the channel back off its response rather than guessing. */
export type PhoneDelivery = 'sms' | 'whatsapp';

/** Who holds the code and can say whether the user typed it right.
 *  'local'   — we generated it, its HMAC is in otp_codes.code_hash (the original design)
 *  'prelude' — Prelude generated it; only Prelude can confirm it (see the sentinel below) */
export type CodeVerifier = 'local' | 'prelude';

export interface PhoneSendResult {
  delivery: PhoneDelivery;
  verifier: CodeVerifier;
}

/** Written into otp_codes.code_hash when Prelude owns the code.
 *
 *  Why a sentinel and not a new column: the column is NOT NULL and every reader
 *  already loads it, so one well-known value flips the row to "ask Prelude"
 *  without a migration — and prod migrations here must be applied by hand
 *  (the CLI's history is out of sync), which would have gated this on the owner.
 *
 *  It is collision-proof by construction: a real value is 64 hex chars from
 *  hmacHex, and ':' is not a hex digit, so no generated code can ever hash to
 *  this string. matchesOtpCode() below is the ONLY place allowed to branch on it. */
export const PRELUDE_CODE_SENTINEL = 'prelude:v2';

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

/** Map a Prelude channel name onto what our code screen can actually say.
 *  Prelude also routes via rcs/viber/zalo/telegram; all of those land in a
 *  messaging app rather than the SMS inbox, so 'whatsapp' is the honest label
 *  ("check your messaging app"), and only true SMS reports as 'sms'. */
function preludeChannelToDelivery(channels: unknown): PhoneDelivery {
  const first = Array.isArray(channels) ? String(channels[0] ?? '') : '';
  return first === 'sms' || first === 'voice' ? 'sms' : 'whatsapp';
}

/**
 * Prelude — an OTP-specialist provider that owns the sender registrations we are
 * otherwise blocked on, and falls back across channels by itself. Returns the
 * channel it used, or false when the rail is off or unconfigured.
 */
export async function sendCodeByPrelude(
  to: string,
  code: string,
  kind: CodeKind = 'signin',
): Promise<PhoneSendResult | false> {
  const apiKey = Deno.env.get('PRELUDE_API_KEY');
  if (!apiKey) return false;
  if (Deno.env.get('LINKY_PRELUDE_DELIVERY_ENABLED') === '0') return false;

  // Two modes, and the account decides which one is even possible.
  //
  // custom_code ON  → Prelude delivers OUR code and we verify it ourselves, so
  //                   nothing downstream changes. This is the nicer shape.
  // custom_code OFF → Prelude generates AND verifies the code (2026-08-07: the
  //                   feature is gated, the API answers `custom_code_not_allowed`).
  //                   We then ask Prelude at check time instead of comparing a
  //                   hash, and the code never touches our servers at all.
  //
  // Flip PRELUDE_CUSTOM_CODE_ENABLED=1 the day support enables it — no redeploy,
  // and the local path is still there untouched.
  const useCustomCode = Deno.env.get('PRELUDE_CUSTOM_CODE_ENABLED') === '1';
  const options: Record<string, unknown> = { locale: 'fr-FR' };
  if (useCustomCode) {
    options.custom_code = code;
  } else {
    // Match the app's six-cell input; Prelude's own default is four digits.
    options.code_size = 6;
  }
  // By default we pin NOTHING and let Prelude route: picking the working
  // channel per country is the whole reason we are here, and its first real
  // send to Guinea went out over SMS on its own. Forcing WhatsApp would only
  // fight that (client 2026-08-07: WhatsApp is not wanted). Set
  // PRELUDE_CHANNELS="sms" or "whatsapp,sms" to override — note `channels` and
  // `preferred_channel` are mutually exclusive (`channels_conflict`), so we
  // only ever send the list.
  const pinned = (Deno.env.get('PRELUDE_CHANNELS') ?? '')
    .split(',').map((c) => c.trim()).filter(Boolean);
  if (pinned.length) options.channels = pinned;
  // Only set when provided: an unapproved sender_id is rejected outright, and
  // Prelude picks a working sender by itself when we say nothing.
  const senderId = Deno.env.get('PRELUDE_SENDER_ID');
  if (senderId) options.sender_id = senderId;

  try {
    const r = await fetch('https://api.prelude.dev/v2/verification', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        target: { type: 'phone_number', value: to },
        options,
        metadata: { correlation_id: kind },
      }),
    });
    const raw = await r.text();
    if (!r.ok) {
      // Prelude puts the actionable reason in the body (unsupported country,
      // sender_id not approved, custom_code not enabled on the account…).
      throw new Error(`prelude ${r.status}: ${raw.slice(0, 500)}`);
    }
    const body = JSON.parse(raw) as { status?: string; reason?: string; channels?: unknown };
    // 'blocked' means Prelude's anti-fraud refused to send — nothing left. Its
    // shadow variant is a dry-run: the rule fired but the message DID go out.
    if (body.status === 'blocked') {
      console.error(`[phone-code] prelude blocked the send: reason=${body.reason ?? '?'}`);
      throwApi('OTP_DELIVERY_FAILED', 502, "Envoi du code impossible pour ce numéro.");
    }
    return {
      delivery: preludeChannelToDelivery(body.channels),
      verifier: useCustomCode ? 'local' : 'prelude',
    };
  } catch (e) {
    // Do NOT fail the request here: Prelude being down must fall through to the
    // Twilio rails below rather than strand the user. Only a hard 'blocked'
    // (above) stops the chain, because retrying that elsewhere is pointless.
    console.error('[phone-code] prelude delivery failed:', (e as Error).message);
    return false;
  }
}

/**
 * Try every phone rail in order and report which one carried the code AND who
 * can verify it. null => nothing is configured; the caller must fail closed
 * rather than hand the code back in the response.
 */
export async function sendCodeToPhone(
  to: string,
  code: string,
  kind: CodeKind = 'signin',
): Promise<PhoneSendResult | null> {
  const viaPrelude = await sendCodeByPrelude(to, code, kind);
  if (viaPrelude) return viaPrelude;
  // The Twilio rails always carry OUR code, so they always verify locally.
  if (await sendCodeBySms(to, code, kind)) return { delivery: 'sms', verifier: 'local' };
  if (await sendCodeByWhatsapp(to, code, kind)) return { delivery: 'whatsapp', verifier: 'local' };
  return null;
}

/** Ask Prelude whether `code` is the one it sent to `target`.
 *  Returns false on ANY doubt — a network failure must read as "wrong code",
 *  never as "let them in". */
async function checkCodeWithPrelude(target: string, code: string): Promise<boolean> {
  const apiKey = Deno.env.get('PRELUDE_API_KEY');
  if (!apiKey) {
    // The row says Prelude owns this code but the key is gone: nobody can
    // verify it. Fail closed.
    console.error('[phone-code] prelude-verified OTP but PRELUDE_API_KEY is unset');
    return false;
  }
  try {
    const r = await fetch('https://api.prelude.dev/v2/verification/check', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ target: { type: 'phone_number', value: target }, code }),
    });
    const raw = await r.text();
    if (!r.ok) {
      console.error('[phone-code] prelude check failed:', r.status, raw.slice(0, 300));
      return false;
    }
    // Prelude returns status 'success' only when the code matches an open
    // verification; everything else ('failure', 'expired_or_not_found', …) is a
    // refusal. Compare explicitly rather than treating "not failure" as valid.
    const body = JSON.parse(raw) as { status?: string };
    return body.status === 'success';
  } catch (e) {
    console.error('[phone-code] prelude check threw:', (e as Error).message);
    return false;
  }
}

/**
 * The ONE place that decides whether a typed code is correct, for every OTP
 * purpose (signin, add_phone, password_change). Routes on the stored hash:
 * the Prelude sentinel means only Prelude can answer, anything else is our own
 * HMAC compared in constant time.
 *
 * Callers must still own everything around it — expiry, consumed_at, attempt
 * counting, purpose and user_id scoping. This function answers exactly one
 * question and keeps no state.
 */
export async function matchesOtpCode(args: {
  storedHash: string;
  target: string;
  code: string;
  hmacSecret: string;
}): Promise<boolean> {
  if (args.storedHash === PRELUDE_CODE_SENTINEL) {
    return await checkCodeWithPrelude(args.target, args.code);
  }
  const expected = await hmacHex(args.hmacSecret, `${args.target}:${args.code}`);
  return timingSafeEqual(expected, args.storedHash);
}
