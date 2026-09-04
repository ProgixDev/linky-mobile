// Frais de livraison Linky (client 2026-07-30 : « la livraison sera assurée par
// Linky avec des frais de livraison applicables »).
//
// GNF est zéro-décimale : minor == major, donc 5 000 minor = 5 000 GNF.
//
// 2026-08-22 : 15 000 -> 5 000 GNF, et le forfait s'applique PAR BOUTIQUE (deux
// boutiques = deux colis = deux trajets), présenté à l'acheteur comme un seul
// chiffre.
//
// 2026-09-03 : la grille à la distance est arrivée (client : « 1 km = 2000
// GNF »). Le calcul vit désormais en base — delivery_fee_for_shop, migration
// 20260903_01 — parce que lui seul connaît les coordonnées et la tarification.
// Le forfait ci-dessous n'a PAS disparu : il reste le REPLI, utilisé dès que la
// distance n'est pas fiable (l'un des deux points est encore le centroïde de sa
// ville, faute de point posé sur la carte). C'est le garde-fou qui empêche de
// facturer une géométrie fictive — voir l'en-tête de la migration.
//
// ⚠️ À GARDER SYNCHRONISÉ avec le front (app-mobile/src/lib/delivery.ts,
// DELIVERY_FEE_GNF), qui l'affiche tant que le devis serveur n'a pas répondu.
export const DELIVERY_FEE_MINOR = 5000;

/**
 * L'adresse de livraison retenue pour CE panier.
 *
 * Résolue côté serveur, jamais envoyée par le client, et volontairement par la
 * MÊME règle que le trigger create_delivery_for_new_order (adresse par défaut
 * de l'acheteur) : si les deux divergeaient, on facturerait la distance vers
 * une adresse et livrerait à une autre.
 *
 * Renvoie null quand l'acheteur n'a pas d'adresse par défaut — l'appelant
 * retombe alors sur le forfait, exactement comme avant.
 */
export async function resolveDeliveryAddressId(
  // deno-lint-ignore no-explicit-any -- client Supabase, typé côté appelant
  sb: any,
  buyerId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from('addresses')
    .select('id')
    .eq('user_id', buyerId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    // Jamais bloquant : une adresse illisible doit coûter le forfait, pas la
    // commande.
    console.error('[delivery] default address lookup failed:', error);
    return null;
  }
  return data?.id ?? null;
}
