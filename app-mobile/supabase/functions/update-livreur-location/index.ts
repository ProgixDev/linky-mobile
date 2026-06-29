// Live courier location ping — the driver app POSTs its GPS periodically while en
// route so the buyer can watch the courier approach. Authed (requireUser → caller).
// The guarded UPDATE is the gate: only the ASSIGNED livreur, only an active
// (assigned/in_transit) delivery. Best-effort + idempotent-ish: a ping that matches
// nothing (delivered / not theirs) just no-ops (ok:false) instead of erroring, so the
// driver app never has to special-case a stale stream.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  delivery_id: string;
  lat: number;
  lng: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return (
    typeof x.delivery_id === 'string' &&
    UUID_RE.test(x.delivery_id) &&
    typeof x.lat === 'number' &&
    Number.isFinite(x.lat) &&
    x.lat >= -90 &&
    x.lat <= 90 &&
    typeof x.lng === 'number' &&
    Number.isFinite(x.lng) &&
    x.lng >= -180 &&
    x.lng <= 180
  );
}

Deno.serve(makePost<Body>('/v1/deliveries/livreur-location', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb
    .from('deliveries')
    .update({
      livreur_lat: body.lat,
      livreur_lng: body.lng,
      livreur_location_at: new Date().toISOString(),
    })
    .eq('id', body.delivery_id)
    .eq('livreur_id', userId)
    .in('status', ['assigned', 'in_transit'])
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[update-livreur-location] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // No row matched ⇒ stale/not-theirs ⇒ no-op (not an error — keeps the stream simple).
  return { body: { ok: !!data } };
}));
