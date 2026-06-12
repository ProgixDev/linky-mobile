// Phase V.1 — reserve-first wrap.
//
// Old wrap CHECKed idempotency then ran the handler then UPSERTed. Two
// concurrent same-key POSTs both passed the check (no row visible to either)
// and the handler executed twice. New wrap RESERVEs first : an INSERT before
// the handler ensures unique_violation surfaces under concurrency, the second
// caller reads the existing row, and decides REPLAY vs 409 REQUEST_IN_FLIGHT
// vs 409 IDEMPOTENCY_KEY_CONFLICT based on its state. See
// _shared/idempotency.ts for the state machine.
//
// IMPORTANT : every function bundled with the OLD wrap retains the old
// behavior until redeployed. Fn-by-fn rollout order is the safety property
// (see PHASE_V_PROMPT V.1) — list-notifications first to verify the new
// wrap, then the money fns.
import { handlePreflight, corsHeaders } from '@shared/cors.ts';
import { apiError, isApiError, jsonResponse } from '@shared/errors.ts';
import { serviceClient, type SupabaseClient } from '@shared/db.ts';
import {
  reserveIdempotency,
  completeIdempotency,
  cancelIdempotency,
  isIdempotencyDbError,
} from '@shared/idempotency.ts';

export interface Ctx<T> {
  sb: SupabaseClient;
  body: T;
  req: Request;
}

export interface HandlerResult {
  status?: number;
  body: unknown;
}

export function makePost<T>(
  route: string,
  validate: (b: unknown) => b is T,
  handler: (ctx: Ctx<T>) => Promise<HandlerResult>,
  // Runs over the response body BEFORE it is persisted in
  // idempotency_keys.response_body. The LIVE response sent to the caller is
  // unaffected. Used by token-minting endpoints to strip access_token /
  // refresh_token so a service-role DB read can't replay live credentials
  // for the 24h cache window. Contract : clients calling a previously-cached
  // idempotency-key get back only the non-credential subset (e.g. { user }).
  cacheResponseFilter?: (body: unknown) => unknown,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const pre = handlePreflight(req);
    if (pre) return pre;
    const cors = corsHeaders(req);

    if (req.method !== 'POST') return apiError('METHOD_NOT_ALLOWED', 405, 'Méthode non autorisée', cors);

    const idemKey = req.headers.get('idempotency-key');
    if (!idemKey) return apiError('IDEMPOTENCY_KEY_REQUIRED', 400, "En-tête Idempotency-Key requis", cors);

    const rawBody = await req.text();
    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); }
    catch { return apiError('INVALID_BODY', 400, 'Corps JSON invalide', cors); }
    if (!validate(parsed)) return apiError('INVALID_BODY', 400, 'Corps invalide', cors);

    const sb = serviceClient();

    // Phase V.1 — reserve-first. DB errors at this stage surface as 500 so
    // money endpoints never silently re-execute on a degraded cache layer.
    let reservation;
    try {
      reservation = await reserveIdempotency(sb, idemKey, route, rawBody);
    } catch (e) {
      if (isIdempotencyDbError(e)) {
        console.error(`[${route}] idempotency reserve DB error:`, e.cause ?? e.message);
        return apiError('INTERNAL_ERROR', 500, 'Erreur base de données', cors);
      }
      console.error(`[${route}] idempotency reserve unexpected:`, e);
      return apiError('INTERNAL_ERROR', 500, 'Erreur interne', cors);
    }

    if (reservation.action === 'conflict') {
      return apiError('IDEMPOTENCY_KEY_CONFLICT', 409, "Clé déjà utilisée avec un autre payload", cors);
    }
    if (reservation.action === 'in_flight') {
      return apiError('REQUEST_IN_FLIGHT', 409, 'Requête déjà en cours, réessaie dans un instant.', cors);
    }
    if (reservation.action === 'replay' && reservation.cached) {
      return jsonResponse(reservation.cached.response_body, reservation.cached.status_code, cors);
    }

    // action === 'execute' — we own the reservation, run the handler.
    try {
      const { status = 200, body } = await handler({ sb, body: parsed, req });
      const cacheBody = cacheResponseFilter ? cacheResponseFilter(body) : body;
      await completeIdempotency(sb, idemKey, status, cacheBody);
      return jsonResponse(body, status, cors);
    } catch (e) {
      // Drop the reservation so the next client retry can re-execute. If the
      // delete itself fails it's logged but swallowed — we want to surface
      // the ORIGINAL error to the user, not a 500 from the cleanup path.
      await cancelIdempotency(sb, idemKey);
      if (isApiError(e)) return apiError(e.code, e.status, e.message_fr, cors);
      console.error(`[${route}] handler error:`, e);
      return apiError('INTERNAL_ERROR', 500, 'Erreur interne', cors);
    }
  };
}

// Shared filter for token-minting endpoints. Returns a shallow clone of the
// body with access_token + refresh_token stripped. See cacheResponseFilter
// contract above.
export function stripTokens(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { access_token: _a, refresh_token: _r, ...rest } = body as Record<string, unknown>;
  return rest;
}
