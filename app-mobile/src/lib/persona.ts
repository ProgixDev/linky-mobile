// Quelles annonces un compte a le droit de VOIR, selon son rôle de publication.
//
// DEMANDE DU CLIENT, 2026-09-08 22:50 : « Si on suit la logique de la
// concurrence, les vendeurs ne voient que les annonces d'articles et les
// propriétaires / Agent immobilier ne voient que les annonces Immo. »
//
// POURQUOI CE FICHIER EXISTE. La règle vivait recopiée dans trois écrans
// (Annonces, Découvrir, carte du fil) sous la forme `isAgent && !isSeller &&
// !isBuyer`. Trois copies, donc trois occasions de dériver — et elles ont
// dérivé : la carte du fil décale son en-tête selon SA copie, si bien qu'une
// divergence d'un seul terme désaligne l'affichage. Une seule fonction, lue par
// tout le monde.
//
// LE TERME QUI A ÉTÉ RETIRÉ, ET C'ÉTAIT LE BOGUE. Les copies exigeaient
// `!isBuyer` : un compte vendeur QUI AVAIT AUSSI activé le rôle acheteur — le
// cas d'Abdoulaye sur sa capture — n'était « pur » ni dans un sens ni dans
// l'autre, donc la séparation ne s'appliquait pas et les deux catégories
// s'affichaient. C'est exactement ce qu'il décrit : « les annonces Immo
// apparaissent quand je suis en mode vendeur et inversement ».
//
// LES DEUX RÔLES NE RÉPONDENT PAS À LA MÊME QUESTION :
//   'buyer'           — le droit d'ACHETER et de réserver
//   'seller'/'agent'  — la CATÉGORIE dans laquelle on se trouve
// Activer « Acheteur » permet donc d'acheter dans sa catégorie ; ça n'ouvre
// plus l'autre catalogue. Pour voir les deux, il faut porter les deux rôles de
// publication — ou aucun, le cas de l'acheteur simple.
//
// CONSÉQUENCE ASSUMÉE : un vendeur qui veut louer un logement doit décocher
// « Vendeur » dans Profil > Mes rôles. C'est la logique demandée ; ses
// commandes et réservations DÉJÀ passées restent, elles, toujours accessibles
// depuis Profil, quelle que soit sa catégorie — de l'argent engagé ne doit
// jamais devenir injoignable.
export type ListingScope = 'products' | 'properties' | 'both';

export function listingScope(roles: string[]): ListingScope {
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  // Les deux rôles, ou aucun : rien à restreindre. « Aucun » couvre l'acheteur
  // simple et le compte tout juste créé dont les rôles ne sont pas encore
  // remontés — dans le doute on montre tout, jamais un catalogue vide.
  if (isSeller === isAgent) return 'both';
  return isSeller ? 'products' : 'properties';
}
