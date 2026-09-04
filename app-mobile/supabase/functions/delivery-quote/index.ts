// Devis de livraison pour un panier — ce que l'ecran de paiement AFFICHERA, et
// qui doit etre exactement ce qui sera preleve.
//
// Pourquoi une fonction serveur pour un simple total : depuis 2026-09-03 le
// tarif depend de la distance (client : « 1 km = 2000 GNF »), donc de
// coordonnees et d'une grille que le client ne voit pas et ne doit pas voir —
// delivery_pricing est service_role uniquement, et shops.lat/lng ne sortent
// meme pas de list-shops. Sans ce devis, l'application multiplierait un
// forfait figé et afficherait un montant different de celui encaisse : la
// classe de bug deja corrigee deux fois cette semaine.
//
// La destination est resolue par la MEME regle que la commande et que le
// trigger de livraison (adresse par defaut de l'acheteur) : le devis ne peut
// donc pas porter sur une autre adresse que celle facturee puis livree.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { DELIVERY_FEE_MINOR, resolveDeliveryAddressId } from '@shared/delivery.ts';

interface Body {
  product_ids: string[];
  delivery_mode?: 'pickup' | 'delivery';
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (!Array.isArray(x.product_ids) || x.product_ids.length === 0 || x.product_ids.length > 40) return false;
  if (!x.product_ids.every((p) => typeof p === 'string' && UUID_RE.test(p))) return false;
  if (x.delivery_mode !== undefined && x.delivery_mode !== 'pickup' && x.delivery_mode !== 'delivery') return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/delivery/quote', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const deliveryMode = body.delivery_mode ?? 'delivery';

  if (deliveryMode === 'pickup') {
    return { body: { total_minor: 0, shops: [], priced_by_distance: false } };
  }

  // Les boutiques concernees, deduites des produits — jamais envoyees par le
  // client, qui pourrait sinon demander un devis pour une boutique proche et
  // commander ailleurs.
  const { data: rows, error: eProd } = await sb
    .from('products')
    .select('shop_id')
    .in('id', body.product_ids);
  if (eProd) {
    console.error('[delivery-quote] products lookup:', eProd);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const shopIds = [...new Set((rows ?? []).map((r: { shop_id: string }) => r.shop_id))];
  if (shopIds.length === 0) {
    throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
  }

  const addressId = await resolveDeliveryAddressId(sb, userId);
  if (!addressId) {
    // Pas d'adresse par defaut : le forfait s'applique, exactement comme la
    // commande le fera.
    return {
      body: {
        total_minor: DELIVERY_FEE_MINOR * shopIds.length,
        shops: shopIds.map((id) => ({ shop_id: id, fee_minor: DELIVERY_FEE_MINOR, priced_by_distance: false })),
        priced_by_distance: false,
      },
    };
  }

  const { data: quote, error: eQuote } = await sb.rpc('delivery_quote', {
    p_shop_ids: shopIds,
    p_address_id: addressId,
    p_fallback_minor: DELIVERY_FEE_MINOR,
  });
  if (eQuote) {
    console.error('[delivery-quote] rpc:', eQuote);
    throwApi('INTERNAL_ERROR', 500, 'Erreur calcul livraison');
  }

  const shops = (quote ?? []) as {
    shop_id: string; fee_minor: number; distance_km: number | null; priced_by_distance: boolean;
  }[];
  const total = shops.reduce((s, r) => s + Number(r.fee_minor), 0);

  // La distance n'est PAS renvoyee, volontairement. L'ecran ne l'affiche pas,
  // et l'exposer ferait de cet endpoint un oracle : en changeant son adresse et
  // en redemandant un devis, un acheteur trilaterait le point exact d'un
  // vendeur. Arrondir a 100 m n'y changeait rien — il suffit de plus de
  // mesures. Le montant seul suffit a l'usage reel.
  return {
    body: {
      total_minor: total,
      shops: shops.map((r) => ({
        shop_id: r.shop_id,
        fee_minor: Number(r.fee_minor),
        priced_by_distance: r.priced_by_distance,
      })),
      priced_by_distance: shops.some((r) => r.priced_by_distance),
    },
  };
}));
