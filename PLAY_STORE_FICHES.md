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

⚠️ **Deux categories MANQUAIENT a ce tableau**, decouvertes en remplissant le
formulaire le 2026-09-30 — a ne pas oublier pour la fiche Depose :

| Categorie | Type | Obligatoire | Finalite |
|---|---|---|---|
| Messages | Autres messages via une appli | Non | Fonctionnalite |
| Photos et videos | **Videos** | Non | Fonctionnalite |

Les messages sont bien stockes (table `messages`), et un vendeur peut joindre
une **video** a son article comme un agent une visite video a son bien — les
deux ont ete verifies dans le code.

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



---

## 9. Le dépôt lui-même — état au 2026-09-29, 17 h

Tentative réelle de `eas submit`, pas une estimation :

```
$ npx eas-cli submit --platform android --latest --non-interactive
Looking up credentials configuration for com.linkygroup.app...
Google Service Account Keys cannot be set up in --non-interactive mode.
    Error: submit command failed.
```

**Aucune clé de compte de service Google n'existe.** C'est le seul verrou qui
empêche de déposer le binaire depuis le terminal, et il ne peut se lever que
dans un navigateur.

### ✅ DÉPOSÉ — 2026-09-30

Le binaire est **sur la piste de test interne**, en brouillon.

```
Release track:  internal
Release status: DRAFT
Version code:   19
Account Email:  play-deploy@adept-parsec-489716-f4.iam.gserviceaccount.com
✔ Submitted your app to Google Play Store!
```

Suivi : https://expo.dev/accounts/linkyorg/projects/linky/submissions/e3044efc-6405-42c7-9322-d7f4744971e8

**Lien d'inscription au test interne** (à ouvrir avec un compte Google figurant
sur la liste de diffusion, aucun autre ne fonctionne) :

```
https://play.google.com/apps/internaltest/4700924577001000108
```

⚠️ Ce lien ne sert PAS aux 12 testeurs. Le test interne ne declenche aucun
compteur : l'exigence des 12 testeurs inscrits 14 jours en continu porte sur le
**test fermé**, et il aura son propre lien.

La clé vit dans le projet Cloud **`adept-parsec-489716-f4`** (« My Maps Project »),
pas dans `linky-757d0` : c'est là que l'API Google Play Android Developer a été
activée, et le compte de service doit vivre dans le projet où elle l'est. Celui
des notifications reste donc séparé — si l'un est révoqué, l'autre survit.

Droits accordés au compte de service, volontairement étroits : *afficher les
informations*, *versions provisoires*, **déployer sur des canaux de test**,
*gérer les canaux de test*. Ni **Administrateur** (qui laisserait une clé posée
sur un disque inviter et supprimer des utilisateurs), ni **mise à disposition de
tous les utilisateurs** (la publication publique) — cette dernière se coche en
trente secondes le jour de la vraie sortie.

⚠️ `DRAFT` veut dire que **rien n'atteint un testeur** tant que personne n'a
cliqué sur « Commencer le déploiement » dans la console.

### Ce qui est prêt, vérifié

| quoi | état |
|---|---|
| AAB Linky | **vc19** sur EAS (`0cf10f20…`), construit le 29/09 à 12 h 26 |
| Profil `submit` | posé dans `eas.json` : piste `internal`, statut `draft` |
| Clé ignorée par git | oui — `.gitignore:53`, `google-service-account*.json` |
| Compte de revue Dépose | **`support@linkygroup.com`** : 1 course `in_transit` toujours vivante (mesuré le 29/09 à 17 h), 91 courses non assignées en réserve |
| Compte de revue Linky | **le même** : les 4 rôles, 1 article actif, 2 biens actifs, 3 commandes achetées, 5 vendues — un seul compte suffit aux deux fiches |

⚠️ **L'AAB vc19 précède le correctif de langue** (commit `d603e44`, avant les
trois commits i18n de l'après-midi). L'OTA `production` le rattrape au
lancement, donc un testeur verra les textes corrigés — mais le tout premier
écran, avant que la mise à jour ne s'applique, vient encore du bundle embarqué.
Reconstruire l'AAB lève ce détail ; ce n'est pas un motif de rejet.

### Créer la clé — les cinq étapes exactes

1. Play Console → **Configuration → Accès à l'API** → *Créer un compte de service*
   (le lien envoie sur Google Cloud Console).
2. Google Cloud → **Comptes de service → Créer**. Un nom suffit, aucun rôle IAM
   n'est nécessaire à cette étape.
3. Sur le compte créé → **Clés → Ajouter une clé → Créer → JSON**. Le fichier se
   télécharge une seule fois.
4. Retour dans Play Console → **Utilisateurs et autorisations** → inviter
   l'adresse du compte de service → autorisation **Administrateur des versions**
   sur les deux applications (au minimum : *Créer et modifier des versions*).
5. Déposer le fichier dans `app-mobile/google-service-account.json`.

Puis, en une commande :

```
cd app-mobile
npx eas-cli submit --platform android --latest --non-interactive
```

Il part en **brouillon** sur la piste **interne** : rien n'atteint un testeur
tant que personne n'a cliqué.

### Ce qui reste hors terminal, et bloque la fiche (pas le binaire)

- **Les captures d'écran.** Celles du dossier `play-store-assets/captures/`
  habillent encore les anciennes prises de vue, faites avec l'application en
  anglais alors que des libellés restaient en français. Elles sont à REPRENDRE
  avec l'application en français, l'OTA étant passée. Liste écran par écran en
  section 4bis ; la légende du Profil existe désormais aussi.
- **Classification du contenu (IARC)**, **public cible**, **publicités**,
  **Sécurité des données** : formulaires de la console. Les réponses sont
  rédigées en sections 3 et 7, il n'y a qu'à les reporter.
- **Adresse postale complète** pour la politique de confidentialité.

---

## 10. Les déclarations que la piste fermée réclame

Relevées le 2026-09-30 en tentant de créer la release en test fermé. Cinq
erreurs bloquantes, dont deux qui n'étaient prévues nulle part.

### Pays et régions — le piège du test fermé

**Sélectionner TOUS les pays.** Un testeur situé dans un pays non coché ne peut
pas installer l'application, et il ne comptera jamais dans les 12. La communauté
de testeurs peut être n'importe où. Sur une piste fermée ça ne coûte rien :
seuls les gens de la liste de diffusion y ont accès de toute façon. On
restreindra à la Guinée au moment de la production, si on le souhaite.

### Fonctionnalités financières → « aucune »

Réponse : **« Mon application ne propose aucune fonctionnalité financière ».**

La liste que Google propose est fermée et ne contient rien qui corresponde :
prêt personnel, facilitateur de prêt, prêt sur salaire, banque, ligne de crédit,
avance sur salaire, microfinance, programme de points, paiement fractionné ;
portefeuille et échange de **cryptomonnaie**, NFT, trading d'actions,
financement participatif ; surveillance de crédit, conseil financier, assurance.

Le portefeuille Linky ne conserve que le produit des ventes en attente de
retrait — c'est du paiement de place de marché, et la seule entrée
« portefeuille » de la liste vise les cryptomonnaies.

Ce qui rend la réponse défendable plutôt qu'optimiste : **l'envoi d'argent entre
particuliers a été retiré le 2026-07-02 précisément parce qu'il aurait exigé une
licence de transmetteur de fonds BCRG**. Le périmètre a été choisi pour rester
du côté « place de marché » ; la déclaration ne fait que le refléter.

⚠️ **Déclencheur** : si le P2P est réactivé un jour, cette réponse devient
fausse et doit être refaite.

#### La preuve, relevée le 2026-09-30

La liste RÉELLE du formulaire est plus riche que celle de la documentation
publique : elle contient une rubrique **« Paiements et transferts »** avec
*« Paiements mobiles et portefeuilles numériques »* et *« Services de virements
et transferts d'argent »*. Linky ayant un portefeuille, la question se pose
vraiment. Elle se tranche dans `app-mobile/src/lib/flags.ts` :

```
P2P_SEND_ENABLED = false
// turning Linky into a money-transmitter / e-money service requires
// a BCRG licence + AML/KYC compliance

WALLET_TOPUP_ENABLED = false
// a rechargeable balance spendable with third-party sellers meets
// Guinea's e-money definition (Loi L/2017/031/AN) and would require
// a BCRG EME agrément
```

Le portefeuille ne peut donc **ni être rechargé, ni servir à envoyer de
l'argent**. Il affiche l'état d'un séquestre et accumule les gains d'un vendeur
jusqu'à son retrait. Le paiement, lui, passe **par ordre** via des rails sous
agrément (Stripe, Lengopay) — le commentaire du code le dit : *« Orders are
paid PER-ORDER through licensed rails »*, et nomme la référence visée :
**« Jumia posture »**.

**Confirmation par Google** : après la réponse « aucune fonctionnalité
financière », l'étape 2 « Documents » affiche *« vous n'avez pas besoin de
fournir de documents supplémentaires »*. Cocher « Paiements mobiles et
portefeuilles numériques » y aurait déclenché une demande d'agréments.

### Déclaration de santé → non

Linky ne touche ni à la santé, ni au bien-être, ni aux données médicales, ni à
la recherche clinique. Aucune case à cocher.

### Les deux autres

- **« Ajoutez une description complète »** : le texte est en section 1.
- **« Votre application n'est pas encore prête à être publiée »** : erreur
  parapluie, elle tombe quand le reste est fait. Le tableau de bord de
  l'application liste ce qui manque dans l'ordre.

---

## 11. Classification IARC — les 21 réponses, telles que validées

Relevé le 2026-09-30 en remplissant le questionnaire pour Linky. La section 7
donnait les grandes lignes ; voici les réponses exactes, question par question.

**Catégorie : « Tous les autres types d'applications »** — pas « Social ou
Communication », dont la définition est *« l'objectif principal est de rencontrer
des personnes ou de communiquer avec elles »*. Linky a une messagerie, mais au
service de la transaction. Cocher « Social » déclencherait un questionnaire plus
strict et une classification plus haute, pour une application qui n'est pas un
réseau social.

**Adresse e-mail du questionnaire** : `support.linky@gmail.com` — une boîte
réellement relevée. Le courrier de `linkygroup.com` part chez Hostinger et
personne ne l'ouvre (constaté le 2026-09-30).

| # | Question | Réponse |
|---|---|---|
| 1 | Contenu pertinent aux évaluations dans le paquet | Non |
| 2 | Les utilisateurs peuvent interagir / échanger du contenu | **Oui** |
| 3 | Le contenu généré par l'utilisateur est la source PRINCIPALE | Non ⚠ |
| 4 | Partage public de nudité | Non |
| 5 | Partage public de violence explicite | Non |
| 6 | Possibilité de **bloquer** | **Oui** |
| 7 | Possibilité de **signaler** | **Oui** |
| 8 | Modération des conversations | Non ⚠ |
| 9 | Interactions limitées aux amis invités | Non |
| 10 | Contenu hors paquet accessible depuis l'app | **Oui** ⚠ |
| 11 | Violence | Non |
| 12 | Sexualité | Non |
| 13 | Propos potentiellement choquants | Non |
| 14 | Drogues illégales ou récréatives | Non |
| 15 | Axée sur des produits assujettis à l'âge | Non |
| 16 | Partage la position précise avec d'autres utilisateurs | Non (Dépose : **Oui**) |
| 17 | Achat d'articles numériques | **Oui** — le boost |
| 18 | Achats à **éléments aléatoires** (loot boxes) | **Non** 🔴 |
| 19 | Récompenses en espèces, cartes cadeaux, play-to-earn, crypto, NFT | Non |
| 20 | Navigateur ou moteur de recherche | Non |
| 21 | Produit d'actualité ou d'éducation | Non |

### 🔴 Le piège de la question 18

Elle apparaît en sous-question dès qu'on répond « Oui » à la 17, et une réponse
« Oui » par réflexe coûte cher. Mesuré : elle faisait passer le **Brésil à 18+**,
l'**Allemagne à USK 12** avec le descripteur « Augmentation des primes
incitatives à l'achat », et collait « (inclut des éléments aléatoires) » à la
mention « Achats dans l'application » **dans le monde entier**.

Or le boost n'a rien d'aléatoire — quatre paliers affichés
(`_shared/boost.ts`) : 3 j / 5 000, 7 j / 10 000, 14 j / 17 500, 30 j / 30 000.
Aucun `Math.random` nulle part. Réponse **Non**. Après correction : Brésil 14+,
Allemagne Tous publics, descripteur disparu.

### ⚠ Les trois réponses contre-intuitives

**Q3 — « Non », alors qu'on croirait « Oui ».** Les annonces sont bien écrites
par des vendeurs. Mais Google tranche lui-même dans ce questionnaire : les
questions 11 à 14 répètent *« le contenu créé par les vendeurs dans le cadre du
catalogue doit être pris en compte, cependant cette question ne porte pas sur le
contenu généré par les utilisateurs (les commentaires et les avis) »*. Dans leur
vocabulaire : annonces = **catalogue**, contenu généré = **commentaires et
avis**. Ces derniers ne sont pas la source principale du contenu de Linky.

**Q8 — « Non », et c'est assumé.** Les conversations ne sont ni filtrées ni
relues : aucun point d'entrée de signalement dans `app/messages/` (vérifié).
Ce qui existe — signaler, bloquer, console d'administration — est déjà déclaré
aux questions 6 et 7. Répondre « Oui » affirmerait un dispositif que Google ne
trouverait pas. Le coût du « Non » est nul, le public étant déclaré 18+.
*Pour pouvoir répondre « Oui » un jour : brancher la feuille de signalement
existante sur un fil de messages avec `targetKind: 'user'`. Le mécanisme est
là, il manque le point d'entrée.*

**Q10 — « Oui ».** Le libellé détaillé donne le cas en exemple : *« listes de
produits dans l'application Amazon Shopping »*. Le catalogue de Linky n'est pas
embarqué dans l'APK, et l'app propose en plus des descriptions rédigées par IA.

### Classifications obtenues

Brésil 14+ · Amérique du Nord Tout public · Europe PEGI 3 · Allemagne USK Tous
publics · Reste du monde 3+ · Russie 3+ · Corée du Sud 3+.
Partout : « Interactivité des utilisateurs » et « Achats in-app ».

Le 14+ brésilien vient de la combinaison interactivité + achats intégrés ;
ClassInd est plus sévère sur l'interaction. Sans effet pratique, le public
déclaré étant 18+.

---

## 12. Securite des donnees — les reponses, telles que validees

Formulaire rempli le 2026-09-30. Trois reponses ne changent JAMAIS, sur les
quatorze fiches :

- **Collectees**, jamais « Partagees ». Supabase, Stripe, Lengopay, Mapbox,
  Twilio sont des prestataires agissant pour le compte du developpeur — ce
  n'est pas un transfert a un tiers au sens de Google. Resultat public sur la
  fiche : **« Aucune donnee partagee avec des tiers »**.
- **Traitement ephemere : Non** — tout est conserve en base.
- **Jamais « Publicite ou marketing »** comme finalite : l'app a declare ne
  contenir aucune publicite, ce serait se contredire.

| Donnee | Requise ? | Finalites |
|---|---|---|
| Nom | **Requise** | Fonctionnement + Gestion des comptes |
| Adresse e-mail | Peut choisir | Fonctionnement + Gestion des comptes |
| Numero de telephone | Peut choisir | Fonctionnement + Gestion des comptes |
| Adresse postale | Peut choisir | Fonctionnement + Gestion des comptes |
| Historique des achats | **Requise** | Fonctionnement |
| Autres infos financieres | **Requise** | Fonctionnement |
| Position approximative | Peut choisir | Fonctionnement |
| Position exacte | Peut choisir | Fonctionnement |
| Autres messages via une appli | Peut choisir | Fonctionnement |
| Photos | Peut choisir | Fonctionnement |
| Videos | Peut choisir | Fonctionnement |
| Interactions avec l'appli | **Requise** | Fonctionnement |
| Autre contenu genere par l'utilisateur | Peut choisir | Fonctionnement |
| ID de l'appareil | Peut choisir | Fonctionnement + **Communications du developpeur** |

### Les arbitrages, pour ne pas les refaire

**E-mail et telephone « peut choisir »** : on s'inscrit avec l'un OU l'autre.
Qui cree son compte par telephone ne donne jamais d'e-mail. Aucun des deux
n'est donc obligatoire pris isolement.

**ID de l'appareil, seule fiche avec « Communications du developpeur »** : le
jeton sert precisement a envoyer les notifications. Ne PAS cocher « Publicite
ou marketing » : la case vise les notifications qui *promeuvent* un produit,
celles de Linky sont transactionnelles.

**Interactions avec l'appli « requise », finalite Fonctionnement et pas
Analyse** : le compteur de vues tourne des qu'une annonce est ouverte, et le
nombre est *rendu au vendeur* (« 27 vues »). C'est une fonctionnalite affichee,
pas du pilotage interne.

**Position : AU PREMIER PLAN uniquement.** Aucune permission
`ACCESS_BACKGROUND_LOCATION`, seul `watchPositionAsync` (reverifie 2026-09-30).
Declarer l'arriere-plan imposerait une declaration speciale et une video de
demonstration.

**Informations de paiement : NON collectees.** Numeros de carte et codes Mobile
Money sont saisis chez le prestataire et ne transitent jamais par l'app.
Idem pour les pieces d'identite : le prestataire KYC les traite, l'app ne garde
que le *resultat*.

### ⚠ Le seul point qui engage juridiquement

L'**adresse de livraison** est transmise au livreur assigne. « Partagees » a ete
laisse vide, au motif que l'exception de Google couvre un transfert que
l'utilisateur DECLENCHE lui-meme en commandant, et qui est necessaire a la
prestation demandee. Un livreur n'est pas un tiers destinataire, c'est
l'executant de la livraison commandee.

C'est defendable, et c'est la seule reponse du formulaire qui merite une
relecture posee avec le client.

### Suppression des donnees

URL : `https://linkygroup.com/legal/suppression-compte` — **verifiee, repond
200** (comme `/legal/privacy`). Suppression partielle sans supprimer le
compte : **Non**, le mecanisme n'existe pas.

⚠️ Google exige de cette page trois choses : nommer l'application ou le
developpeur, decrire clairement la demarche, et preciser quelles donnees sont
supprimees ou conservees et combien de temps. La page repond, son CONTENU n'a
pas ete verifie contre ces trois exigences.
