// Seller assigns a livreur to one of their orders. Authed (requireUser →
// caller_id). The assign_delivery RPC enforces seller-only + livreur-role
// gates + delivery-not-already-completed ; this fn just maps RPC errors to
// the public API surface.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  order_id: string;
  livreur_id: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !UUID_RE.test(x.order_id)) return false;
  if (typeof x.livreur_id !== 'string' || !UUID_RE.test(x.livreur_id)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/deliveries/assign', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error: rpcErr } = await sb.rpc('assign_delivery', {
    p_order_id:   body.order_id,
    p_livreur_id: body.livreur_id,
    p_caller_id:  userId,
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[delivery-assign] rpc error:', rpcErr);
    if (msg.includes('ORDER_NOT_FOUND'))             throwApi('ORDER_NOT_FOUND',             404, 'Commande introuvable.');
    if (msg.includes('NOT_ORDER_SELLER'))            throwApi('FORBIDDEN',                   403, "Tu n'es pas le vendeur de cette commande.");
    if (msg.includes('INVALID_STATUS'))              throwApi('INVALID_STATUS',              400, 'Cette commande ne peut pas recevoir de livreur dans son état actuel.');
    if (msg.includes('LIVREUR_NOT_FOUND'))           throwApi('LIVREUR_NOT_FOUND',           404, 'Livreur introuvable.');
    if (msg.includes('NOT_A_LIVREUR'))               throwApi('NOT_A_LIVREUR',               400, "Cet utilisateur n'est pas livreur.");
    if (msg.includes('DELIVERY_NOT_FOUND'))          throwApi('DELIVERY_NOT_FOUND',          404, 'Livraison introuvable.');
    if (msg.includes('DELIVERY_ALREADY_COMPLETED'))  throwApi('DELIVERY_ALREADY_COMPLETED',  400, 'Livraison déjà terminée.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur assignation livreur');
  }

  const { data: row, error: readErr } = await sb
    .from('deliveries')
    .select('id, order_id, livreur_id, status, delivery_address, assigned_at, pickup_at, delivered_at, created_at, updated_at')
    .eq('order_id', body.order_id)
    .single();
  if (readErr || !row) {
    console.error('[delivery-assign] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture livraison');
  }

  return { body: { delivery: row } };
}));
