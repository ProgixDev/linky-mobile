// Phase P.3 — Didit decision webhook (public endpoint, signature-gated).
//
// Didit POSTs { session_id, status, vendor_data, ...decision } with an
// HMAC-SHA256 hex signature of the RAW body in x-signature (or
// x-didit-signature). No bearer / idempotency-key — so this bypasses
// makePost and gates on the signature alone. Deploy with --no-verify-jwt.
//
// Replay / ordering safety lives in applyKycDecision : only OPEN sessions
// accept writes, so late or out-of-order deliveries are no-ops. Unknown
// session ids and unknown status strings are logged and acknowledged (200)
// so Didit doesn't retry forever ; DB failures return 500 so Didit DOES
// retry instead of dropping the decision.
import { serviceClient } from '@shared/db.ts';
import { verifyDiditSignature, applyKycDecision, isKnownDiditStatus } from '@shared/didit.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'content-type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') ?? req.headers.get('x-didit-signature');
  if (!(await verifyDiditSignature(rawBody, signature))) {
    console.error('[didit-webhook] bad or missing signature');
    return new Response(JSON.stringify({ error: 'invalid_signature' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  let payload: { session_id?: string; status?: unknown } & Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  if (!payload.session_id || typeof payload.session_id !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_session_id' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  if (!isKnownDiditStatus(payload.status)) {
    // A signed webhook with a status we don't recognize (new Didit feature,
    // schema drift) must NOT be coerced into 'pending' — ack and ignore.
    console.error('[didit-webhook] unknown status ignored:', payload.status);
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  const sb = serviceClient();
  const applied = await applyKycDecision(sb, payload.session_id, payload.status, payload, 'webhook');
  console.log(`[didit-webhook] session ${payload.session_id} → ${applied}`);

  if (applied === 'error') {
    // DB hiccup : 500 makes Didit retry the delivery instead of dropping it.
    return new Response(JSON.stringify({ error: 'apply_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
});
