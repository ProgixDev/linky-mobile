// Le VENDEUR confirme une remise en scannant le QR affiche sur le telephone de
// l'acheteur. Client 2026-08-22 : « le client ne scanne jamais un QR, il genere
// seulement un QR pour sa commande ».
//
// Decalque exact de livreur-confirm-handoff, un cran plus loin : le livreur
// couvre les livraisons, celle-ci couvre les remises SANS livreur (retrait en
// boutique, portage a la main). Sans elle, retirer le scanner de l'acheteur
// rendrait ces commandes inconfirmables et l'argent resterait en sequestre.
//
// La garantie tient au meme fait que pour le livreur : le scan_token n'existe
// que sur l'ecran de l'acheteur. Le vendeur ne peut donc liberer les fonds
// qu'en presence physique de l'acheteur. seller_confirm_pickup refuse en outre
// toute commande deja confiee a un livreur.
//
// PII : le scan_token est retire des journaux, comme dans confirm-receipt.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body {
  order_id: string;
  scan_token: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !UUID_RE.test(x.order_id)) return false;
  if (typeof x.scan_token !== 'string' || !UUID_RE.test(x.scan_token)) return false;
  return true;
}

function scrubUuids(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid-redacted>');
}

Deno.serve(makePost<Body>('/v1/orders/seller-confirm-pickup', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error: rpcErr } = await sb.rpc('seller_confirm_pickup', {
    p_order_id:   body.order_id,
    p_seller_id:  userId,
    p_scan_token: body.scan_token,
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    const e = rpcErr as { code?: string; message?: string; details?: string; hint?: string };
    console.error('[seller-confirm-pickup] rpc error:', {
      code: e.code, message: scrubUuids(e.message),
      details: scrubUuids(e.details), hint: scrubUuids(e.hint),
    });
    if (msg.includes('ORDER_NOT_FOUND'))    throwApi('ORDER_NOT_FOUND',    404, 'Commande introuvable.');
    if (msg.includes('ORDER_NOT_SELLER'))   throwApi('FORBIDDEN',          403, "Tu n'es pas le vendeur de cette commande.");
    if (msg.includes('LIVREUR_ASSIGNED'))   throwApi('LIVREUR_ASSIGNED',   400, "Cette commande est confiée à un livreur : c'est lui qui confirme la remise.");
    if (msg.includes('INVALID_STATUS'))     throwApi('INVALID_STATUS',     400, 'État de commande invalide pour cette action.');
    if (msg.includes('INVALID_SCAN_TOKEN')) throwApi('INVALID_SCAN_TOKEN', 400, "Le QR scanné ne correspond pas à cette commande.");
    if (msg.includes('WALLET_NOT_FOUND'))   throwApi('INTERNAL_ERROR',     500, 'Erreur portefeuille');
    throwApi('INTERNAL_ERROR', 500, 'Erreur confirmation de remise');
  }

  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, amount_minor, status')
    .eq('id', body.order_id)
    .single();
  if (oErr || !order) {
    console.error('[seller-confirm-pickup] order readback error:', oErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }

  // L'acheteur est prevenu : sans cela, il ne saurait pas que sa commande a ete
  // marquee remise — et c'est le moment ou son recours passe par le litige.
  notifyDetached(sb, {
    userIds: [order.buyer_id as string],
    category: 'order',
    title: 'Commande remise',
    body: `Le vendeur a confirmé la remise de ta commande #${order.reference}.`,
    iconHint: 'check',
    deeplink: `/order/${order.id}`,
    refType: 'order',
    refId: order.id as string,
  });

  return { body: { order_status: order.status } };
}));
