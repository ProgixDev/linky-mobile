// The PICKUP step — the livreur taps « J'ai récupéré le colis » at the boutique,
// moving the delivery assigned → in_transit (and stamping pickup_at). Authed
// (requireUser → caller must be the ASSIGNED livreur). The guarded UPDATE is the
// gate: only their own delivery, only from 'assigned'. confirm-handoff already
// accepts in_transit, so the scan/handoff still works afterwards. Best-effort
// buyer notification (« en route ») mirrors confirm-handoff's posture.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body {
  delivery_id: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.delivery_id === 'string' && UUID_RE.test(x.delivery_id);
}

Deno.serve(makePost<Body>('/v1/deliveries/livreur-mark-pickup', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Guarded transition: only the assigned livreur, only from 'assigned'. The WHERE
  // clause IS the authorization + state gate — 0 rows back ⇒ not theirs / wrong state.
  const { data: updated, error } = await sb
    .from('deliveries')
    .update({ status: 'in_transit', pickup_at: new Date().toISOString() })
    .eq('id', body.delivery_id)
    .eq('livreur_id', userId)
    .eq('status', 'assigned')
    .select('id, order_id, status, pickup_at')
    .maybeSingle();
  if (error) {
    console.error('[livreur-mark-pickup] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!updated) {
    throwApi(
      'INVALID_DELIVERY_STATUS',
      409,
      'Cette livraison ne peut pas être marquée comme récupérée (déjà récupérée ou non assignée).',
    );
  }

  // Tell the buyer their order is on the way (fire-and-forget; never blocks the action).
  const { data: order } = await sb
    .from('orders')
    .select('id, reference, buyer_id')
    .eq('id', updated.order_id)
    .maybeSingle();
  if (order?.buyer_id) {
    notifyDetached(sb, {
      userIds: [order.buyer_id as string],
      category: 'order',
      title: 'Ta commande est en route',
      body: `Le livreur a récupéré ta commande #${order.reference} — elle arrive bientôt.`,
      iconHint: 'truck',
      deeplink: `/order/${order.id}`,
      refType: 'order',
      refId: order.id as string,
    });
  }

  return { body: { id: updated.id, status: updated.status, pickup_at: updated.pickup_at } };
}));
