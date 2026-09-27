# Audit adversarial du lot « déclinaisons » — reste à traiter

**Origine.** Audit lancé le 2026-09-27 après le déploiement du lot tailles/couleurs
(`9a5b15c`), sur cinq angles : chemin de l'argent SQL, identité des lignes de panier,
fonctions edge, flux vendeur/dons, restitution du stock. Chaque trouvaille devait passer
deux sceptiques chargés de la **réfuter**.

**⚠️ L'audit s'est bloqué** à 10 verdicts sur 20. Les 19 trouvailles ci-dessous sont donc
rendues telles quelles ; seules celles marquées **[vérifié]** ont été confirmées, soit par
un sceptique, soit à la main. Les autres restent **à confirmer avant d'y toucher** — un
audit n'est pas une liste de bugs, c'est une liste d'hypothèses.

**Déjà fait :** #15 (argent) corrigé et déployé le 2026-09-27 (`c2ffba7`).

---

## Argent

### ✅ #15 — Panier multi-boutiques + don : 15 000 GNF facturés pour un objet gratuit
**CORRIGÉ** (`c2ffba7`). `place-orders-batch` ne lisait jamais `products.is_gift` ; seul
`place-order` refusait le mélange (`GIFT_ALONE`). Commande non closable + séquestre poolé
bloqué. Vérifié maillon par maillon avant correction.

---

## Stock — à traiter en priorité

### #13 — `LIVE_ORDERS` interdit **à vie** d'ajouter des tailles à une annonce qui a déjà vendu
`orders.stock_taken` n'est remis à faux que par la restitution, dont le déclencheur ne
s'arme que sur `cancelled`/`refunded`. Une commande **honorée** (`released`) garde donc
`stock_taken = true` pour toujours, et la garde `LIVE_ORDERS` le teste sans regarder le
statut. Conséquence : la fonctionnalité phare est indisponible **précisément sur les
annonces qui vendent**, avec un message qui promet le contraire (« une fois qu'elles seront
terminées » — elles le sont). La reprise de `20260926_02` a même posé `stock_taken = true`
sur toutes les anciennes commandes de panier déjà honorées.
*Piste : tester `o.stock_taken and o.status not in ('released','refunded','cancelled')`.*

### #12 — `stock_taken` vaut vrai même quand la ligne n'a **rien** pris
Les deux fonctions de commande n'écrivent jamais la colonne : elle prend son défaut `true`,
y compris quand `v_variant.stock is null` (aucun décrément). Si le vendeur chiffre sa
matrice ensuite, la restitution **invente** une unité → survente. `place_gift_order`, elle,
l'écrit correctement (`v_product.stock is not null`) : la même précaution manque dans les
deux chemins payants.

### #11 — Repasser déclinaisons → **simple** n'est pas gardé
`LIVE_ORDERS` ne couvre que le sens simple → déclinaisons (`if not v_had and v_count > 0`).
Dans l'autre sens, une combinaison commandée passe `hidden`, et l'unité rendue plus tard par
la restitution atterrit sur une ligne que plus aucun écran ne peut atteindre. Stock vendable
amputé, silencieusement. C'est le miroir exact de ce que `LIVE_ORDERS` protège.

---

## Saisie vendeur

### #8 — L'ordre de saisie des tailles n'est **pas** conservé
`created_at` est l'horodatage de la **transaction** : identique pour les 4 ou 18 lignes
posées par un seul `insert ... select`. Le tri retombe donc sur `id`, et `uuidv7()` ici est
« millisecondes + 10 octets aléatoires », sans compteur → **ordre arbitraire**. Le correctif
du 2026-09-27 sur `get-product` (`order by created_at, id`) ne fait donc pas ce qu'il
promet. *Piste : une colonne `position int` écrite par `replace_product_variants` depuis
`with ordinality`.*

### #6 — « Quantité disponible » reste modifiable et est **jetée en silence**
Sur une annonce à déclinaisons, les deux blocs s'affichent en même temps. Le vendeur qui
tape `0` pour couper ses ventes lit « 0 = rupture de stock », voit le champ devenir sale,
reçoit le toast de succès — et `product-update` ignore le champ (`willHaveVariants`). Les
commandes continuent d'arriver sur une marchandise qu'il a déclarée indisponible.
*Piste : masquer ou désactiver le champ dès que la matrice est cochée.*

### #17 / #7 — Sortir du don **et** ajouter des tailles au même enregistrement est refusé
C'est pourtant le seul geste que l'interface propose (la matrice n'apparaît qu'une fois
« À donner » décoché). `product-update` écrit la matrice avant le patch et ne relit pas
`is_gift`, donc la RPC voit encore `true` et lève `GIFT_HAS_NO_VARIANTS`. **Tout**
l'enregistrement est perdu — prix, titre, photos — avec un message qui reproche au vendeur
un état qu'il vient de supprimer. *Piste : passer `p_is_gift` à la RPC, ou relire `is_gift`
dans `own`.*

### #19 / #9 — Au-delà de 20 combinaisons : « Corps invalide »
`validVariants` refuse dans `valid()`, donc **avant** le handler : le message soigné
« Vingt combinaisons au maximum. » écrit dans les deux fonctions est **inatteignable**. Le
composant de saisie ne connaît aucun plafond et affiche fièrement « 25 combinaisons ». Même
impasse pour un libellé de plus de 40 caractères (le champ n'a pas de `maxLength`).

### #18 — Aucun plafond sur le stock **par combinaison**
`products.stock` est borné à 100 000, la même valeur portée par une combinaison ne l'est
nulle part. Trois conséquences : dépassement d'entier au cast (500 opaque), débordement de
`sum(...)::int` dans la remontée, et un contournement du plafond (20 × 50 000 000 →
`products.stock` à un milliard, conservé quand la matrice est retirée).

### #16 — `product-create` publie l'annonce **avant** d'écrire la matrice
Tout échec du second temps laisse une annonce **en ligne et achetable**, sans déclinaison,
alors que le vendeur a lu une erreur. Et `wrap.ts` annule la réservation d'idempotence sur
exception : chaque réessai en publie une de plus.

---

## Panier

### #1 [vérifié] — Le garde-fou ne couvre qu'un sens
Une ligne qui **porte** une déclinaison alors que l'annonce n'en a plus passe `needsChoice`
(qui teste `product.hasVariants === true`), affiche même son libellé figé, et tue **tout le
lot** au paiement (`VARIANT_UNEXPECTED`) — sans nommer l'article. Le panier n'étant pas
vidé, chaque tentative suivante échoue à l'identique.

### #2 [vérifié] — Le remède proposé ne répare pas
« Choisir » renvoie à la fiche, où l'ajout crée une ligne **sœur** (`sameLine` compare les
variantId) : l'ancienne ligne morte reste, le blocage persiste, et refaire le geste ajoute
une 3ᵉ ligne. La seule sortie est de deviner qu'il faut décrémenter jusqu'à la corbeille.

### #3 [réfuté ×2] — Clé React de la fiche commande acheteur
`key={it.productId}` collisionne quand une commande porte deux déclinaisons du même article.
Les deux sceptiques concluent qu'il n'en découle **aucun** résultat faux — seulement un
avertissement en mode développement. Correctif d'hygiène d'une ligne, l'écran vendeur le
fait déjà bien.

---

## Ailleurs

### #14 — La console de litige ne montre **jamais** la combinaison commandée
`get-dispute` ne lit pas `order_items`, et l'en-tête construit par `place_order_multi`
(chemin mono-boutique, donc le cas normal) ne porte ni `variantId` ni `variantLabel`.
L'administrateur tranche « mauvaise taille » sans pouvoir savoir laquelle avait été
commandée — sur le seul écran où l'argent bouge.

### #10 — Ordre de verrouillage inversé → interblocage possible
`replace_product_variants` prend produit → ligne fille ; `restore_order_stock` prend ligne
fille → produit (via la remontée). Croisement possible entre l'enregistrement d'une matrice
et une restitution.

### #4 [réfuté] / #5 — L'agrégat `NULL`
Le sceptique a réfuté #4 (`products.stock` n'est plus une porte sur une annonce à
déclinaisons). #5 (le `NULL` survit à la bascule « À donner » → don illimité) **n'a pas été
vérifié** : à confirmer, il dépend de la même prémisse.

---

# ✅ TRAITÉ le 2026-09-27 (`c23ee48`, migration `20260929_03`)

| # | quoi | où |
|---|---|---|
| **#15** | argent : panier multi-boutiques + don | corrigé et déployé (`c2ffba7`) |
| **#13** | la garde bloquait **à vie** après une seule vente | migration `_03` |
| **#11** | sens déclinaisons → simple non gardé | migration `_03` |
| **#8** | ordre de saisie non conservé (colonne `position`) | migration `_03` + `get-product` |
| **#6** | champ « Quantité » qui ment | OTA |
| **#19 / #9** | limite de 20 dite à la saisie + `maxLength` | OTA |
| **#18** | pas de plafond sur le stock par combinaison | `_shared/variants.ts` |
| **#17 / #7** | ordre patch/matrice selon le sens de la bascule | `product-update` |
| **#1** | ligne de panier périmée : réparée au lieu de bloquer | OTA |
| **#3** | clé React de la fiche commande | OTA |

**Reste ouvert :** #12 (`stock_taken` inconditionnel — demande une chirurgie sur les
deux fonctions de commande, délibérément reporté), #2 (le remède du panier crée une
ligne sœur — #1 en retire la cause la plus fréquente), #16 (`product-create` publie
avant d'écrire la matrice — #18 en ferme le déclencheur principal), #14 (console de
litige sans la combinaison), #10 (ordre de verrouillage), #5 (à confirmer).
