# Fiches Play Store et Sécurité des données

Rédigé le 2026-09-26. Tout ce qui suit est **à coller tel quel** dans la Play
Console. Les compteurs de caractères de Google sont stricts : les longueurs sont
indiquées et respectées.

Les réponses du formulaire **Sécurité des données** doivent rester cohérentes
avec <https://linkygroup.com/legal/privacy> — Google compare les deux, et une
contradiction est un motif de rejet à elle seule. Si la politique change, ce
document change avec.

---

## 1. Linky — `com.linkygroup.app`

### Nom de l'application *(30 max)*

```
Linky — Marché & Immobilier
```

### Description courte *(80 max)*

```
Achetez, vendez et louez en Guinée. Paiement sécurisé, livraison suivie.
```

### Description complète *(4000 max)*

```
Linky réunit le marché en ligne et l'immobilier de Guinée dans une seule
application.

ACHETER EN CONFIANCE
Parcourez des milliers d'articles publiés par des vendeurs de Conakry et de tout
le pays. Payez par Orange Money, MTN Mobile Money, carte bancaire ou depuis
votre portefeuille Linky. Votre argent est conservé en séquestre : le vendeur
n'est payé qu'une fois que vous avez confirmé avoir reçu votre commande.

VENDRE SANS VITRINE
Ouvrez votre boutique en quelques minutes, publiez vos articles avec leurs
photos, et suivez vos commandes. Les paiements arrivent dans votre portefeuille
Linky, que vous retirez quand vous le souhaitez.

LOUER ET ACHETER UN LOGEMENT
Appartements, maisons, terrains : trouvez un bien à la journée, au mois ou à
l'achat. Le contrat se signe dans l'application, le loyer part en séquestre, et
il n'est versé au propriétaire qu'à votre emménagement. Vous pouvez annuler et
être remboursé jusqu'à 48 heures avant la date d'entrée.

AGENCES IMMOBILIÈRES
Gérez vos biens, vos réservations et vos revenus locatifs depuis un tableau de
bord séparé de votre boutique — deux métiers, deux caisses.

LIVRAISON SUIVIE
Choisissez le retrait en boutique ou la livraison à domicile. Quand un livreur
Linky prend votre colis, suivez sa position sur la carte jusqu'à votre porte.
La remise se confirme par un QR code, pour que personne ne puisse déclarer une
livraison qui n'a pas eu lieu.

PENSÉE POUR LA GUINÉE
Prix en francs guinéens. Interface en français. Conçue pour fonctionner sur des
connexions lentes.

Des questions ? contact@linkygroup.com
```

### Notes de version *(500 max)*

```
Première version publique de Linky.

• Marché : articles, boutiques, panier multi-boutiques
• Immobilier : location à la journée ou au mois, achat, contrat signé dans l'app
• Paiement Orange Money, MTN, carte et portefeuille Linky
• Séquestre : le vendeur est payé après votre confirmation
• Livraison suivie sur carte et remise par QR code
```

---

## 2. Dépose — `com.linky.driver`

### Nom de l'application *(30 max)*

```
Dépose — Livreur Linky
```

### Description courte *(80 max)*

```
L'application des livreurs Linky : courses, itinéraire et remise par QR.
```

### Description complète *(4000 max)*

```
Dépose est l'application des livreurs partenaires de Linky.

VOS COURSES, AU MÊME ENDROIT
Recevez les livraisons qui vous sont assignées, avec l'adresse de ramassage,
celle du client et le montant de la commande. Tout est dans l'application :
rien à noter, rien à rappeler.

L'ITINÉRAIRE SUR LA CARTE
Suivez votre trajet jusqu'au client sur une carte. Pendant la course, votre
position est partagée avec l'acheteur et le vendeur pour qu'ils sachent où en
est leur colis. Le partage s'arrête dès que la course est terminée.

LA REMISE PAR QR CODE
À l'arrivée, scannez le QR code affiché sur le téléphone du client. C'est ce
scan qui confirme la livraison et déclenche le paiement du vendeur. Pas de
papier, pas de signature, pas de contestation possible.

DEVENIR LIVREUR LINKY
Inscrivez-vous avec votre numéro de téléphone, indiquez votre véhicule et votre
ville. Une fois votre candidature acceptée, vous recevez vos premières courses.

Dépose ne fonctionne qu'avec un compte livreur validé par Linky.

Des questions ? contact@linkygroup.com
```

### Notes de version *(500 max)*

```
Première version publique de Dépose.

• Liste de vos courses assignées, avec adresses et montant
• Itinéraire sur carte jusqu'au client
• Partage de votre position pendant la course, pour l'acheteur et le vendeur
• Confirmation de la remise par scan du QR code du client
• Inscription par numéro de téléphone
```

---

## 3. Sécurité des données

Mêmes réponses pour les deux applications sauf mention contraire. Elles
partagent le compte, la base et les mêmes traitements.

### Questions générales

| Question | Réponse |
|---|---|
| Données chiffrées en transit | **Oui** (TLS) |
| L'utilisateur peut demander la suppression de ses données | **Oui** — dans l'app (Profil → Confidentialité) et sur <https://linkygroup.com/legal/suppression-compte> |
| Application soumise à la politique « Familles » | **Non** — réservée aux 18 ans et plus |

### Données collectées

Toutes sont **associées à l'identité** de l'utilisateur (compte nominatif) et
**aucune n'est utilisée pour de la publicité ou du suivi**.

| Catégorie | Type | Obligatoire | Finalité |
|---|---|---|---|
| Informations personnelles | Nom | Oui | Fonctionnalité de l'app, compte |
| Informations personnelles | Adresse e-mail | Selon connexion | Compte, authentification |
| Informations personnelles | Numéro de téléphone | Selon connexion | Compte, authentification |
| Informations personnelles | Adresse postale | Non | Livraison |
| Informations financières | Historique d'achats | Oui | Fonctionnalité, comptabilité |
| Informations financières | Autres infos financières | Oui | Solde du portefeuille, séquestre |
| Position | Position précise | Non | Fonctionnalité de l'app |
| Position | Position approximative | Non | Fonctionnalité de l'app |
| Photos et vidéos | Photos | Non | Annonces, photo de profil |
| Activité dans l'app | Autre contenu généré | Oui | Annonces, avis, commentaires |
| ID de l'appareil | ID de l'appareil ou autres ID | Oui | Notifications push |

**Ne PAS déclarer** : numéro de carte bancaire et codes Mobile Money — ils sont
saisis chez le prestataire de paiement et ne transitent jamais par l'app.
Les pièces d'identité du parcours de vérification sont traitées directement par
le prestataire : seul le *résultat* est conservé. À déclarer uniquement si la
console propose une catégorie « documents d'identité » et que le prestataire
est considéré comme intégré à l'app — à trancher avec le client.

### Position — le point qui compte

C'est ce que la console examine le plus. Les deux applications utilisent la
position **au premier plan uniquement** : aucune permission
`ACCESS_BACKGROUND_LOCATION`, et le code n'utilise que `watchPositionAsync`
(vérifié le 2026-09-26). Il ne faut donc **pas** déclarer de suivi en arrière-
plan, ce qui évite la déclaration spéciale et la vidéo de démonstration que
Google exige dans ce cas.

- **Linky** : position demandée ponctuellement, quand l'utilisateur pose un
  point sur la carte pour une annonce ou une adresse.
- **Dépose** : position du livreur transmise **pendant une course en cours**,
  application ouverte, pour que l'acheteur et le vendeur suivent le colis. Elle
  cesse à la fin de la course. La position d'un acheteur n'est jamais lue.

### Partage avec des tiers

⚠ **À confirmer avant de valider le formulaire.** Au sens de Google, « partage »
désigne un transfert à un tiers, et les **prestataires techniques agissant pour
le compte du développeur en sont généralement exclus**. Nos destinataires
(Supabase, Lengopay, Stripe, Didit, Mapbox, Prelude, Twilio, Expo) sont tous des
prestataires à ce titre, donc la réponse attendue est **« Non »** sur le partage.

La seule transmission entre utilisateurs est l'**adresse de livraison**,
communiquée au livreur assigné — un transfert nécessaire à la prestation, que
l'utilisateur déclenche lui-même en commandant.

Faire relire ce point : c'est le seul du formulaire dont la réponse engage
juridiquement, et il dépend de la qualification exacte des prestataires.

---

## 4. Reste à fournir

*État au 2026-09-29.*

### ⚠️ Le binaire déposé est PÉRIMÉ — c'est le point le plus important

Le dernier AAB de production est le **versionCode 16 du 24 septembre**. Les sons
de notification demandés par le client ont été ajoutés le **28 septembre**, et
**un son est une ressource native** : il vit dans `android/app/src/main/res/raw`
et ne part **JAMAIS** par une mise à jour OTA.

Publier vc16 livrerait donc une application **sans aucun son personnalisé**,
alors que c'est précisément ce qui a été demandé. **Il faut reconstruire un AAB
avant tout dépôt.** (La version est gouvernée à distance par EAS —
`appVersionSource: remote`, compteur à 18 — donc le `versionCode 1` du
`build.gradle` est ignoré et aucun conflit de numéro n'est possible.)

### Fourni

- ✅ **Icône 512×512** et **bannière 1024×500** pour les deux applications :
  `play-store-assets/`. Générées depuis les icônes de l'application (opaques,
  sans transparence — Play la refuse), bannières au dégradé de la marque.
  Remplaçables sans rien casser si le client préfère les siennes.
- ✅ **Signalement et blocage** : déployés en production le 2026-09-27
  (migration, 11 fonctions edge, OTA sur les deux canaux) et la console
  d'administration le 2026-09-28. Ce point ne bloque plus.

### Toujours à fournir

- **Captures d'écran** : 4 à 6 par application, portrait. Le seul livrable que
  personne n'a encore pris, et il bloque les deux fiches. Liste écran par écran
  en section 4bis.
- **Classification du contenu** : questionnaire à remplir dans la console.
- **Public cible** : 18 ans et plus.
- **Publicités** : l'application n'en contient aucune.
- **Adresse postale** complète pour la politique de confidentialité — « Linky
  Group, Conakry, Guinée » est le minimum actuellement en ligne.
- **Deux comptes de démonstration** pour le formulaire « Accès à
  l'application » — et celui de Dépose doit être un livreur **déjà approuvé**,
  sinon le relecteur ne voit aucune course (section 6).
- **Décision sur le boost** et Google Play Billing (section 8).

## 4bis. Les captures, écran par écran

Portrait, prises sur un vrai téléphone avec un compte qui a des données —
un catalogue vide se voit et donne une mauvaise première impression. Google en
accepte 8 ; en fournir 5 ou 6 suffit.

### Linky

1. **Accueil** — le solde, les deux caisses, le mois en cours et la section
   Activité. C'est l'écran qui montre le plus de vie.
2. **Marché** — la liste des articles avec la feuille de filtres ouverte, ou
   juste après un filtre : on doit voir des annonces réelles.
3. **Fiche d'un article à déclinaisons** — tailles et couleurs affichées. C'est
   ce qui distingue Linky d'un mur de petites annonces.
4. **Paiement** — l'écran de choix du moyen : Orange Money, MTN, carte. Il dit
   « paiement sécurisé » mieux qu'une phrase.
5. **Suivi de commande** — l'état d'avancement avec le QR de remise.
6. *(facultatif)* **Immobilier** — la fiche d'un logement avec ses conditions de
   location.

### Dépose

1. **Liste des courses** du livreur.
2. **Itinéraire** — la carte avec le trajet.
3. **Scan du QR** de remise.
4. **Détail d'une course** — adresse, client, montant.
5. *(facultatif)* **Historique** des courses terminées.

⚠️ Ne PAS photographier un écran contenant un vrai numéro de téléphone, une
vraie adresse ou un vrai nom de client : ces images sont publiques.

## 5. URL communes aux deux fiches

```
Politique de confidentialité  https://linkygroup.com/legal/privacy
Suppression de compte         https://linkygroup.com/legal/suppression-compte
Site web                      https://linkygroup.com
E-mail de contact             contact@linkygroup.com
```

---

## 6. Accès à l'application — le formulaire qui fait recaler les deux apps

La Play Console demande, sous **Contenu de l'application → Accès à l'application**,
comment un relecteur entre dans une application protégée par une connexion. Les
deux le sont : rien n'est visible sans compte, et le code de connexion part vers
un téléphone ou une boîte mail réels. Répondre « aucun identifiant requis » est
le motif de rejet le plus courant pour une application de ce type.

### Linky

Déclarer **« Toutes les fonctionnalités sont accessibles avec des
identifiants »** et fournir un compte de démonstration. Le canal **e-mail**
fonctionne réellement depuis le 2026-06-21, contrairement au SMS Guinée : c'est
celui à donner, un relecteur hors Guinée ne recevra jamais le SMS.

À préparer :

- un compte e-mail dédié, avec le rôle vendeur **et** agent immobilier, pour que
  les deux catalogues soient visibles ;
- au moins une annonce publiée et une commande en cours, sinon les écrans sont
  vides et le relecteur ne voit pas ce que la fiche décrit ;
- dans les instructions, écrire noir sur blanc que le code arrive **par e-mail**
  et où le lire.

### Dépose — un blocage réel, pas une formalité

`livreur_applications.status` vaut `'pending'` par défaut, et seul un admin
l'approuve (`decide_livreur_application`, migration `20260623_01`). Un relecteur
qui s'inscrit **ne verra donc aucune course**, et conclura que l'application ne
fonctionne pas. Le compte de démonstration doit être **déjà approuvé**, et une
livraison doit lui être assignée pour qu'il y ait quelque chose à l'écran.

### ✅ Levé — mesuré en production le 2026-09-29

Les deux écritures ont déjà eu lieu. Il existe **deux livreurs approuvés**, et
l'un d'eux a une course en cours :

| compte | e-mail | ce que le relecteur verrait |
|---|---|---|
| **Abdoul** | `support@linkygroup.com` | **1 course `in_transit`** (25/09) — liste, itinéraire, écran de remise |
| Achraf Progix | `achrafbenamrane@proton.me` | 1 course `delivered` (22/08) — historique seulement, aucune course active |

**Donner `support@linkygroup.com`** : c'est le seul des deux qui montre une
course vivante. L'autre ouvrirait sur une liste vide, exactement ce que cette
section cherche à éviter.

⚠️ **À revérifier juste avant de soumettre.** Une course `in_transit` finit par
être livrée, et le compte retomberait sur une liste vide. Il y a **91 courses
`unassigned`** en base : en assigner une à ce compte depuis la console
d'administration (*Livraisons*) suffit à rétablir la démonstration. La requête
qui répond à la question :

```sql
select u.display_name, e.address, d.status, count(*)
  from public.deliveries d
  left join public.users u on u.id = d.livreur_id
  left join public.emails e on e.user_id = d.livreur_id
 group by 1,2,3;
```

⚠️ **Et un second point, indépendant de Play** : `push_tokens` ne contient
**aucun** jeton pour `app = 'driver'`. Personne ne s'est jamais connecté à Dépose
depuis un téléphone. Ça ne bloque pas la soumission — mais la notification de
nouvelle course n'a jamais été vérifiée en conditions réelles, sons compris.

---

## 7. Classification du contenu (questionnaire IARC)

Catégorie : **Utilitaire / Achats**. Réponses attendues :

| Question | Linky | Dépose |
|---|---|---|
| Violence, sexualité, langage grossier, substances, jeux d'argent | Non | Non |
| Les utilisateurs peuvent communiquer entre eux | **Oui** (avis, commentaires, messages) | Non |
| L'application partage la position physique de l'utilisateur avec d'autres utilisateurs | Non — Linky *affiche* la position du livreur, elle ne transmet pas celle de l'acheteur | **Oui** — la position du livreur est vue par l'acheteur et le vendeur pendant la course |
| Contenu généré par les utilisateurs, non modéré a priori | **Oui** — annonces et commentaires | Non |
| Achats dans l'application | **Oui** — voir la réserve ci-dessous | Non |

Répondre « Oui » à ces deux dernières questions déclenche l'application de la
politique Google sur le **contenu généré par les utilisateurs**, qui exige trois
choses : un moyen de **signaler** un contenu ou un utilisateur, un dispositif de
**modération**, et la possibilité de **bloquer** un utilisateur abusif.

Au 2026-09-26 au matin, Linky n'avait **aucune des trois** : les libellés
« Signaler un problème » de l'application concernaient les bugs, la sécurité et
les litiges de commande, et `livreur-report-issue` est un livreur qui signale un
incident de course. Rien ne permettait de signaler une annonce, un avis ou un
commentaire, ni de bloquer quelqu'un.

**Les trois sont désormais construites** (même jour, non encore déployées) :

- **Signaler** — feuille `ReportSheet` avec six motifs et un champ libre,
  accessible depuis une fiche article, une fiche bien et chaque commentaire.
  Table `content_reports` polymorphe, un signalement par personne et par cible.
- **Bloquer** — table `blocked_users`, filtre **symétrique** appliqué au fil
  Découvrir, aux listes d'articles et de biens, aux commentaires et aux avis. Il
  ne touche jamais une commande ou une réservation en cours : il y a de l'argent
  en séquestre derrière. Déblocage dans Réglages → Confidentialité → Sécurité.
- **Modérer** — onglet « Signalements » de la console admin, file des plus
  anciens d'abord, avec l'aperçu de la cible et le nombre de personnes l'ayant
  signalée. La suppression du contenu reste un geste distinct, pour garder le cas
  du contenu limite qu'on laisse en place.

Reste à faire côté production : appliquer la migration `20260926_01`, déployer
les onze fonctions edge concernées, publier l'OTA sur les deux canaux et
redéployer la console admin.

---

## 8. ⚠ Réserve sérieuse : le boost et Google Play Billing

Le **boost** est un service numérique acheté **dans l'application** (3 à 30
jours, 5 000 à 30 000 GNF — `supabase/functions/_shared/boost.ts`), payé par
Orange Money, MTN ou carte. Aucun passage par **Google Play Billing**.

La politique de paiement de Google exige Play Billing pour tout achat de contenu
ou service **numérique** consommé dans l'application, et prélève 15 à 30 %. Les
biens et services **physiques** en sont exclus — donc les articles du marché, la
livraison et les loyers ne posent aucun problème. Le boost, lui, est
exactement le cas visé : une visibilité numérique, consommée dans l'app.

Ce n'est pas une certitude de rejet — une place de marché peut plaider que le
boost est une prestation publicitaire vendue à un professionnel, et Google traite
ce cas différemment selon les dossiers. Mais c'est le genre de point qui tombe
**après** des semaines de test fermé, quand tout le reste est prêt.

Les trois issues, à trancher par le client :

1. **Soumettre tel quel** et voir. Si Google relève le point, la publication est
   suspendue jusqu'à correction.
2. **Sortir l'achat de boost de l'application** : le vendeur l'achète depuis une
   page web. C'est ce que font la plupart des places de marché, et la politique
   l'autorise explicitement tant que l'app ne renvoie pas vers cette page.
3. **Intégrer Play Billing** pour le boost seul, et accepter la commission.

### Ce que la décision coûte vraiment — mesuré le 2026-09-29

**Le boost n'a jamais rien rapporté.** En production :

| | |
|---|---|
| boosts créés | **9** — dont **8 annulés** et 1 expiré |
| réellement payés | **1** |
| argent encaissé | **5 000 GNF** (une cinquantaine de centimes), sur un compte d'essai |

Il n'y a donc **aucun revenu à protéger**. L'option 1 — soumettre tel quel et
voir — fait courir un risque de suspension pour une fonctionnalité qui n'a
jamais servi. C'est le mauvais pari.

### ✅ DÉCISION DU CLIENT, 2026-09-29 : **on garde le boost dans l'application**

Le client a tranché en connaissance du risque : le boost reste achetable
in-app, hors Play Billing. On soumet ainsi. Ce qui suit n'est plus une
recommandation mais le dossier de défense, et le plan si Google relève le point.

**Ce qui joue en notre faveur, et qui est déjà en place** — vérifié dans le code
le 2026-09-29, il n'y a rien à modifier :

- Le boost est vendu **à un professionnel, pour sa propre annonce**, depuis
  l'espace pro (`app/pro/boost/`). Ce n'est pas un achat proposé au grand public.
- Les libellés le présentent comme une **prestation de visibilité**, jamais comme
  du contenu déverrouillé : « Booster ses annonces », « mettre vos annonces en
  avant », « Plus de vues, plus de ventes », « gagner en visibilité ».
- Google traite les **services publicitaires vendus à une entreprise**
  différemment du contenu numérique consommé dans l'application. C'est exactement
  la case dans laquelle le boost tombe, et la formulation actuelle le dit déjà.
- Les anciens libellés « Très bientôt » sont des chaînes MORTES (vérifié :
  aucun écran ne les rend). L'application ne promet rien qu'elle ne livre.

**Déclarer « Achats dans l'application : Oui »** dans le questionnaire (déjà
prévu en section 7). Ne pas chercher à paraître propre en répondant « Non » :
l'incohérence entre la déclaration et ce que fait l'application est précisément
ce qui attire l'attention.

**Si Google relève quand même le point**, le repli est prêt et chiffré — et
c'est ce qui rend cette décision réversible plutôt que risquée :

1. un drapeau `BOOST_PURCHASE_ENABLED` dans `src/lib/flags.ts` ;
2. masquer les points d'entrée d'achat (`app/pro/boost/new.tsx` et les appels
   depuis `app/product/[id].tsx` et `app/product/edit/[id].tsx`) ;
3. `create-boost` renvoie `FEATURE_DISABLED`, pour que la règle ne se contourne
   pas en appelant l'API autrement ;
4. une OTA sur les deux canaux.

Le dépôt a deux précédents exacts de cette manœuvre (`P2P_SEND_ENABLED` et
`WALLET_TOPUP_ENABLED`). Compter une heure, pas une refonte. Les boosts déjà
actifs continueraient de s'afficher et d'expirer normalement — on fermerait la
vente, pas le mécanisme.


