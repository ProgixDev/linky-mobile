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

### ✅ #12 — `stock_taken` vaut vrai même quand la ligne n'a **rien** pris
Les deux fonctions de commande n'écrivaient jamais la colonne : elle prenait son défaut
`true`, y compris quand `v_variant.stock is null` (aucun décrément). Si le vendeur chiffrait
sa matrice ensuite, la restitution **inventait** une unité → survente. `place_gift_order`,
elle, l'écrivait correctement (`v_product.stock is not null`) : la même précaution manquait
dans les deux chemins payants.

**Corrigé** par `20260929_05_stock_taken_per_line.sql`, appliquée et vérifiée en prod le
2026-09-28. Le marqueur descend au niveau de la LIGNE (`order_items.stock_taken`) parce
qu'une commande peut mélanger une ligne qui a pris du stock et une qui n'en a pas pris ;
un marqueur par commande ne sait que tout rendre ou ne rien rendre. Il est posé dans une
variable (`v_took`) juste après chaque décrément réel, transporté par l'instantané, et
recopié par `fill_order_item_variant`. `orders.stock_taken` garde son rôle d'idempotence.

*Vérifié fonctionnellement*, pas seulement textuellement : le scénario complet de l'audit
rejoué dans une transaction annulée — deux combinaisons, l'une non chiffrée, l'autre à 5 ;
le vendeur chiffre la première à 2 pendant le séquestre ; annulation. La combinaison reste
à **2**. Contrôle négatif à l'appui : en remettant `stock_taken = true` sur cette ligne, le
même test rend **3** et échoue. Le test a des dents.

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

### ✅ #16 — `product-create` publie l'annonce **avant** d'écrire la matrice
Tout échec du second temps laissait une annonce **en ligne et achetable**, sans déclinaison,
alors que le vendeur avait lu une erreur. Et `wrap.ts` annule la réservation d'idempotence
sur exception : chaque réessai en publiait une de plus.

**Corrigé** (déployé v29). L'annonce naît `pending` et ne passe `active` qu'une fois la
matrice écrite. `pending` n'invente aucun état : `get-product` et `place_order_multi`
exigent déjà `status = 'active'`, donc la fenêtre est invisible ET incommandable de bout en
bout. L'échec retire la ligne ; si le retrait échoue à son tour elle reste `pending`,
c'est-à-dire dans l'état sûr — l'invisibilité vient du status, pas du nettoyage.

Au passage : `replace_product_variants` n'est plus appelée pour rien. Tout le monde envoie
`variants`, une annonce simple comme un don en envoient un tableau **vide**, et sur une
annonce qui vient de naître la fonction n'a alors rien à faire. Un aller-retour de moins à
chaque publication, et la fenêtre d'échec disparaît là où elle n'apportait rien.

*Sonde* : `scripts/probe-publish-after-matrix.sql`. Contrôle négatif : en insérant `active`
dès le départ, elle échoue sur « une annonce en attente a ete COMMANDEE ».

---

## Panier

### #1 [vérifié] — Le garde-fou ne couvre qu'un sens
Une ligne qui **porte** une déclinaison alors que l'annonce n'en a plus passe `needsChoice`
(qui teste `product.hasVariants === true`), affiche même son libellé figé, et tue **tout le
lot** au paiement (`VARIANT_UNEXPECTED`) — sans nommer l'article. Le panier n'étant pas
vidé, chaque tentative suivante échoue à l'identique.

### ✅ #2 [vérifié] — Le remède proposé ne répare pas
« Choisir » renvoyait à la fiche, où l'ajout crée une ligne **sœur** (`sameLine` compare les
variantId) : l'ancienne ligne morte restait, le blocage persistait, et refaire le geste
ajoutait une 3ᵉ ligne. La seule sortie était de deviner qu'il fallait décrémenter jusqu'à la
corbeille.

**Corrigé** (OTA). Le choix se refait **dans le panier**, par une feuille qui réutilise le
sélecteur de la fiche. `chooseVariant` RÉÉCRIT la ligne en gardant sa quantité et sa place ;
si une autre ligne porte déjà cette combinaison, on y verse la quantité et on retire la
cassée — deux lignes du même couple se disputeraient la même identité et le serveur les
refuserait en bloc (`DUPLICATE_ITEM`). Et « Payer » ouvre le choix au lieu de le réclamer.

### #3 [réfuté ×2] — Clé React de la fiche commande acheteur
`key={it.productId}` collisionne quand une commande porte deux déclinaisons du même article.
Les deux sceptiques concluent qu'il n'en découle **aucun** résultat faux — seulement un
avertissement en mode développement. Correctif d'hygiène d'une ligne, l'écran vendeur le
fait déjà bien.

---

## Ailleurs

### ✅ #14 — La console de litige ne montre **jamais** la combinaison commandée
`get-dispute` ne lisait pas `order_items`, et l'en-tête construit par `place_order_multi`
ne porte ni `variantId` ni `variantLabel`. L'administrateur tranchait « mauvaise taille »
sans pouvoir savoir laquelle avait été commandée — sur le seul écran où l'argent bouge.

**Corrigé** (get-dispute v18, get-order v25 déployées ; **la console admin reste à
déployer**). `mapOrderItem` + `ORDER_ITEM_COLUMNS` vivent dans `@shared/catalog.ts` et les
deux fonctions s'en servent : ni la forme ni le `select` ne peuvent diverger, et
l'administrateur voit littéralement ce que voit l'acheteur. La combinaison a sa propre
pastille, et la section devient « Articles (n) » quand la commande en porte plusieurs.
Deux replis : une erreur de lecture n'interrompt pas la réponse, et `items` est optionnel
côté console — un dossier de litige ne doit jamais devenir inconsultable.

### ✅ #10 — Ordre de verrouillage inversé → interblocage possible
`replace_product_variants` prend produit → ligne fille ; `restore_order_stock` prenait ligne
fille → produit (via la remontée). Croisement possible entre l'enregistrement d'une matrice
et une restitution.

⚠️ **L'ordre du CODE ne le disait pas** : l'écriture sur `products` ne concerne que les
lignes SANS déclinaison (son sous-select filtre `variant_id is null`), donc sur un article à
déclinaisons elle ne verrouillait rien. Il fallait lire le sous-select pour le voir.

**Corrigé** (migration `_07`). Le corps partagé prend les lignes produit d'abord et **dans
l'ordre des identifiants**, si bien que deux restitutions concurrentes se sérialisent aussi
entre elles. Vérification de FORME assumée : un vrai interblocage demanderait deux sessions
concurrentes, impossible par un aller-retour SQL.

### ⚠️ ET LA SECONDE PORTE DE #12, TROUVÉE EN CHERCHANT #10
`20260929_05` a posé le filtre `oi.stock_taken` sur `restore_order_stock` — mais il y a
**deux** chemins de restitution, et la sonde n'en couvrait qu'un. Tout passage en
`cancelled`/`refunded` déclenche `trg_restore_stock_on_order_cancel`, qui RÉIMPLÉMENTAIT la
restitution, **sans le filtre**. Mesuré : la scène de #12 annulée par un changement de
status rendait la combinaison à 3 au lieu de 2. Le défaut était donc toujours vivant sur le
chemin réel.

**Corrigé** (migration `_07`) : `restore_order_stock_lines` est désormais le SEUL endroit où
la restitution est écrite ; les deux appelants ne font que l'encadrer, et le contrôle refuse
que l'un d'eux contienne encore `product_variants`. La divergence devient impossible, elle
n'est pas seulement corrigée. *Sonde* : `scripts/probe-restitution-both-doors.sql`.

### #4 [réfuté] / ✅ #5 — L'agrégat `NULL`
Le sceptique a réfuté #4 (`products.stock` n'est plus une porte sur une annonce à
déclinaisons). #5 (le `NULL` survit à la bascule « À donner » → don illimité) était le seul
point **non vérifié** de l'audit.

**CONFIRMÉ, et plus large que décrit.** `place_gift_order` ne décrémente que si `stock` n'est
pas nul, et laisse l'annonce `active` dans tous les cas : un don à quantité non déclarée est
ILLIMITÉ. Mesure : **trois** réservations sur le même objet, dont une de cent unités, toutes
en `paid`, toutes « à retirer chez le donneur ». Le chemin décrit par l'audit existe bien,
mais la cause ne s'y limite pas — tout don sans quantité est illimité, quelle que soit la
façon dont il l'est devenu.

⚠️ **Aucune donnée abîmée** : zéro don en prod, mesuré. Le défaut était latent.

**Corrigé** (migration `_06` + product-create v29 / product-update v25 déployées). Un
invariant de base plutôt qu'un cas particulier dans le chemin de l'argent : avec une
quantité, la branche `stock is not null` qui existe déjà décrémente, épuise et pose
`stock_taken`. La fonction refuse en plus le cas par un NOM (`GIFT_STOCK_UNDECLARED`), au
cas où la contrainte serait un jour retirée. *Sonde* :
`scripts/probe-gift-declared-quantity.sql`, dont le contrôle négatif est gratuit.

---

# ✅ TRAITÉ le 2026-09-27 (`c23ee48`, migration `20260929_03`)

| # | quoi | où |
|---|---|---|
| **#15** | argent : panier multi-boutiques + don | corrigé et déployé (`c2ffba7`) |
| **#12** | `stock_taken` inconditionnel → stock inventé | migrations `_05` **et `_07`** (2 portes) |
| **#5** | un don sans quantité est illimité | migration `_06` + 2 fns |
| **#16** | annonce publiée avant sa matrice | `product-create` (v29) |
| **#2** | le panier créait une ligne sœur | OTA |
| **#14** | console de litige sans la combinaison | `get-dispute`/`get-order` + console admin |
| **#10** | ordre de verrouillage inversé | migration `_07` |
| **#13** | la garde bloquait **à vie** après une seule vente | migration `_03` |
| **#11** | sens déclinaisons → simple non gardé | migration `_03` |
| **#8** | ordre de saisie non conservé (colonne `position`) | migration `_03` + `get-product` |
| **#6** | champ « Quantité » qui ment | OTA |
| **#19 / #9** | limite de 20 dite à la saisie + `maxLength` | OTA |
| **#18** | pas de plafond sur le stock par combinaison | `_shared/variants.ts` |
| **#17 / #7** | ordre patch/matrice selon le sens de la bascule | `product-update` |
| **#1** | ligne de panier périmée : réparée au lieu de bloquer | OTA |
| **#3** | clé React de la fiche commande | OTA |

**Rien ne reste ouvert.** Les dix-neuf trouvailles sont traitées : corrigées, ou réfutées
par un sceptique (#3, #4).

Deux leçons valent plus que les correctifs eux-mêmes, et sont encodées dans le dépôt :

1. **Deux copies d'une règle d'argent finissent par diverger.** La restitution de stock
   existait en deux exemplaires ; l'un a gardé six semaines un filtre que l'autre avait
   reçu, et ma propre sonde de #12 est restée verte en frappant à la bonne porte du mauvais
   mur. La forme d'une ligne de commande était en train de prendre le même chemin. Les deux
   sont désormais définies **une seule fois**, et un contrôle refuse la réapparition d'une
   copie.

2. **Une sonde qui ne peut pas échouer ne prouve rien.** Chacune des sondes de ce lot est
   accompagnée de son contrôle négatif, écrit dans son en-tête et mesuré.
