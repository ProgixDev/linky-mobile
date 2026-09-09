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

// ⚠️ LA TABLE DE VÉRITÉ, PARCE QUE CETTE RÈGLE A ÉTÉ ÉCRITE TROIS FOIS.
//
//   acheteur  vendeur  agent   portée        d'où ça vient
//   ────────────────────────────────────────────────────────────────────────
//      ✓         ✗       ✗     both          acheteur simple
//      ✓         ✓       ✗     both          client 2026-09-09 (voir plus bas)
//      ✓         ✗       ✓     both          client 2026-09-09 (son compte)
//      ✓         ✓       ✓     both
//      ✗         ✓       ✗     products      client 2026-09-08 22:50
//      ✗         ✗       ✓     properties    client 2026-09-08 22:50
//      ✗         ✓       ✓     both          les deux catégories publiées
//      ✗         ✗       ✗     both          rôles pas encore remontés
//
// TROISIÈME ÉNONCÉ DU CLIENT, 2026-09-09 : « En masquant les annonces immo en
// mode Vendeur uniquement et les annonces Articles en mode Immo uniquement, tu
// as masqué pour le mode Acheteur + Vendeur et aussi Acheteur + Immo. »
//
// Autrement dit : la restriction ne vise QUE le professionnel pur. Dès que le
// rôle acheteur est actif, la personne achète — et qui achète voit tout le
// catalogue. C'est cohérent avec `canBuy` juste en dessous : le rôle acheteur
// est ce qui donne le droit d'acheter, il serait absurde qu'il ouvre la caisse
// en fermant la moitié du magasin.
//
// CE TERME AVAIT DÉJÀ EXISTÉ, ET JE L'AVAIS RETIRÉ LA VEILLE. Le client avait
// signalé que la séparation ne s'appliquait pas sur son compte ; j'en ai conclu
// que le terme acheteur était le coupable et je l'ai supprimé, ce qui a étendu
// la restriction aux comptes mixtes. La cause était ailleurs : `loadRoles()`
// (src/stores/auth.ts) retombe sur ['buyer'] tant que la charge serveur n'est
// pas arrivée, si bien qu'un démarrage à froid montre tout pendant un instant.
// Ce repli est VOULU — dans le doute, un catalogue complet vaut mieux qu'un
// catalogue vide — mais il ressemble à une règle cassée. Ne pas le « corriger »
// en durcissant la portée : c'est ce qui a produit ce troisième aller-retour.
export function listingScope(roles: string[]): ListingScope {
  // Le rôle acheteur l'emporte sur tout le reste.
  if (roles.includes('buyer')) return 'both';
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  // Les deux rôles de publication, ou aucun : rien à restreindre.
  if (isSeller === isAgent) return 'both';
  return isSeller ? 'products' : 'properties';
}

// Le droit d'ACHETER, de LOUER et de RÉSERVER.
//
// DEMANDE DU CLIENT, 2026-09-08 23:01 : « On ne peut pas faire de commande ni
// louer si le mode Acheteur n'est pas activé. » Il l'avait déjà écrit le matin
// (« il faut activer le profil acheteur pour pouvoir faire ça ») ; je l'avais
// lu comme une plainte au lieu d'une règle. Cette fois c'est explicite.
//
// POURQUOI UNE FONCTION POUR UN `includes`. Parce que la portée d'affichage
// ci-dessus s'est mise à dériver dès qu'elle a été recopiée à trois endroits,
// et que celle-ci sera lue depuis bien plus de fichiers — chaque bouton qui
// engage de l'argent. Un nom unique se cherche, se relit, et se change en un
// seul endroit le jour où le client change d'avis.
//
// CE QUE CE VERROU N'EST PAS. Il protège l'ENGAGEMENT, pas ce qui a déjà été
// engagé. Quelqu'un qui a commandé puis désactivé son rôle acheteur doit
// toujours pouvoir suivre sa commande, scanner son QR, ouvrir un litige et
// être remboursé — sinon de l'argent réel devient injoignable. Ne jamais
// étendre `canBuy` aux écrans de suivi, de reçu ou de litige.
export function canBuy(roles: string[]): boolean {
  return roles.includes('buyer');
}
