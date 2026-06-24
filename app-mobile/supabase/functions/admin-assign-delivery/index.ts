// Phase LIVREUR ASSIGNMENT — admin assigns (or reassigns) a delivery to an
// approved livreur. Admin-only (requireUser + assertAdmin).
//
// Body : { delivery_id, livreur_id }
// The admin_assign_delivery RPC enforces is_admin + livreur-role + assignable
// delivery state (unassigned/assigned/in_transit) + escrow invariant (order
// paid/preparing), supports REASSIGN, and writes the order event. This fn maps
// RPC errors to the public surface, notifies the (new) livreur, and returns the
// updated delivery shaped like admin-list-deliveries rows.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { notifyDetached } from '@shared/push.ts';

const UUID_RE = /^[0-9a-f-]{36}$/i;

interface Body {
  delivery_id: string;
  livreur_id: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.delivery_id !== 'string' || !UUID_RE.test(x.delivery_id)) return false;
  if (typeof x.livreur_id !== 'string' || !UUID_RE.test(x.livreur_id)) return false;
  return true;
}

interface DeliveryJson {
  id: string;
  order_id: string;
  livreur_id: string | null;
  status: string;
  delivery_address: Record<string, unknown> | null;
  assigned_at: string | null;
  created_at: string;
}

Deno.serve(makePost<Body>('/v1/admin/deliveries/assign', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data, error } = await sb.rpc('admin_assign_delivery', {
    p_delivery_id: body.delivery_id,
    p_livreur_id: body.livreur_id,
    p_admin_id: adminId,
  });
  if (error) {
    const msg = (error as { message?: string } | null)?.message ?? '';
    console.error('[admin-assign-delivery] rpc error:', error);
    if (msg.includes('NOT_ADMIN'))               throwApi('FORBIDDEN_ADMIN',         403, 'Accès admin requis.');
    if (msg.includes('DELIVERY_NOT_FOUND'))      throwApi('DELIVERY_NOT_FOUND',      404, 'Livraison introuvable.');
    if (msg.includes('INVALID_DELIVERY_STATUS')) throwApi('INVALID_DELIVERY_STATUS', 400, 'Cette livraison ne peut plus être (ré)assignée.');
    if (msg.includes('ORDER_NOT_FOUND'))         throwApi('ORDER_NOT_FOUND',         404, 'Commande introuvable.');
    if (msg.includes('INVALID_ORDER_STATUS'))    throwApi('INVALID_ORDER_STATUS',    400, "La commande n'est pas dans un état permettant l'assignation.");
    if (msg.includes('LIVREUR_NOT_FOUND'))       throwApi('LIVREUR_NOT_FOUND',       404, 'Livreur introuvable.');
    if (msg.includes('NOT_A_LIVREUR'))           throwApi('NOT_A_LIVREUR',           400, "Cet utilisateur n'est pas livreur.");
    throwApi('INTERNAL_ERROR', 500, 'Erreur assignation livraison');
  }

  const d = data as DeliveryJson;

  // Read order context + buyer city + livreur name for the response + push.
  const { data: order } = await sb
    .from('orders')
    .select('reference, product_snapshot, amount_minor, buyer_id')
    .eq('id', d.order_id)
    .maybeSingle();
  const buyerId = (order as { buyer_id?: string } | null)?.buyer_id ?? null;
  const contactIds = [d.livreur_id, buyerId].filter((v): v is string => !!v);
  const userById = new Map<string, { display_name: string | null; city: string | null }>();
  if (contactIds.length > 0) {
    const { data: users } = await sb.from('users').select('id, display_name, city').in('id', contactIds);
    for (const u of (users as { id: string; display_name: string | null; city: string | null }[] | null) ?? []) {
      userById.set(u.id, { display_name: u.display_name, city: u.city });
    }
  }

  const reference = (order as { reference?: string } | null)?.reference ?? null;

  // Notify the (new) livreur — best-effort, never fails the assignment.
  if (d.livreur_id) {
    notifyDetached(sb, {
      userIds: [d.livreur_id],
      category: 'order',
      title: 'Nouvelle livraison',
      body: reference ? `La commande ${reference} t'a été assignée.` : "Une livraison t'a été assignée.",
      iconHint: 'bolt',
      deeplink: `/delivery/${d.id}`,
      refType: 'order',
      refId: d.order_id,
    });
  }

  const delivery = {
    id: d.id,
    orderId: d.order_id,
    status: d.status,
    deliveryAddress: d.delivery_address,
    assignedAt: d.assigned_at,
    assignedLivreur: d.livreur_id
      ? { id: d.livreur_id, name: userById.get(d.livreur_id)?.display_name ?? null }
      : null,
    order: order
      ? {
          reference,
          productSnapshot: (order as { product_snapshot?: unknown }).product_snapshot ?? null,
          amountGnf: Number((order as { amount_minor?: number | string }).amount_minor ?? 0),
          buyerCity: buyerId ? userById.get(buyerId)?.city ?? null : null,
        }
      : null,
    createdAt: d.created_at,
  };

  return { body: { delivery } };
}));
