// Delivery-problem path — the livreur marks an active delivery as FAILED when they
// can't complete it (client absent, wrong address, refused…). Authed (requireUser →
// assigned livreur). Guarded UPDATE: only their own delivery, only from an active
// state. Records the reason on deliveries.notes and notifies the seller so they can
// re-dispatch or contact support. Does NOT touch the order/escrow — that stays held
// for admin/seller resolution (re-dispatch or refund via the dispute flow).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body {
  delivery_id: string;
  reason: string;
  note?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const REASON_FR: Record<string, string> = {
  client_absent: 'Client absent',
  wrong_address: 'Mauvaise adresse',
  refused: 'Colis refusé',
  unreachable: 'Client injoignable',
  other: 'Autre',
};

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.delivery_id !== 'string' || !UUID_RE.test(x.delivery_id)) return false;
  if (typeof x.reason !== 'string' || !(x.reason in REASON_FR)) return false;
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 300)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/deliveries/livreur-report-issue', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const reasonFr = REASON_FR[body.reason];
  const note = body.note?.trim();
  const noteText = `Problème: ${reasonFr}${note ? ` — ${note}` : ''}`;

  const { data: updated, error } = await sb
    .from('deliveries')
    .update({ status: 'failed', notes: noteText })
    .eq('id', body.delivery_id)
    .eq('livreur_id', userId)
    .in('status', ['assigned', 'in_transit'])
    .select('id, order_id')
    .maybeSingle();
  if (error) {
    console.error('[livreur-report-issue] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!updated) {
    throwApi(
      'INVALID_DELIVERY_STATUS',
      409,
      'Cette livraison ne peut pas être signalée (déjà terminée ou non assignée).',
    );
  }

  // Notify the seller so they can re-dispatch or contact support (best-effort).
  const { data: order } = await sb
    .from('orders')
    .select('id, reference, seller_id')
    .eq('id', updated.order_id)
    .maybeSingle();
  if (order?.seller_id) {
    notifyDetached(sb, {
      userIds: [order.seller_id as string],
      category: 'order',
      title: 'Problème de livraison',
      body: `Le livreur a signalé un problème (${reasonFr}) sur la commande #${order.reference}.`,
      iconHint: 'warn',
      deeplink: `/seller/orders/${order.id}`,
      refType: 'order',
      refId: order.id as string,
    });
  }

  return { body: { ok: true } };
}));
