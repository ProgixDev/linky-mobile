// Twilio delivery-status webhook.
//
// Twilio's Messages API answers 201 « queued » the moment it ACCEPTS a message,
// long before the carrier actually delivers it. Every SMS to Guinea (+224) has
// been accepted and then silently lost, so our functions only ever saw the
// happy 201 and we had no way to know why the handset never rang.
//
// Twilio POSTs the final state here (queued → sent → delivered | undelivered |
// failed) together with an ErrorCode. Logging it turns an invisible failure
// into a precise, actionable diagnosis :
//   30003 unreachable handset · 30005 unknown/inactive number
//   30006 landline or unreachable carrier · 30007 blocked by carrier
//   21408 our Twilio account is not permitted to send to this country
//
// Public on purpose: Twilio calls it with no bearer token. It only WRITES to
// the log — no database access, no secrets echoed, nothing to abuse.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  try {
    const form = await req.formData();
    const get = (k: string) => String(form.get(k) ?? '');
    const status = get('MessageStatus');
    const code = get('ErrorCode');
    // Log the destination country only — never the full number.
    const to = get('To');
    const country = to.startsWith('+') ? to.slice(0, 4) : '?';
    // `From` is OUR sender, not user data. Its SHAPE is the thing we need:
    // West-African networks routinely reject alphanumeric sender IDs and
    // foreign long codes, which surfaces as a generic carrier error 30008.
    const from = get('From');
    const fromType = /^\+?\d{6,}$/.test(from)
      ? `number(${from})`
      : from
        ? `alphanumeric(${from})`
        : 'messaging-service';
    console.log(
      `[twilio-status] sid=${get('MessageSid')} status=${status}` +
        `${code ? ` errorCode=${code}` : ''} country=${country} from=${fromType}`,
    );
  } catch (e) {
    console.error('[twilio-status] could not parse callback:', e);
  }
  // Twilio retries on non-2xx; always acknowledge.
  return new Response('', { status: 204 });
});
