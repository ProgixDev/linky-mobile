# Daily Report — Achraf Benamrane

**Date :** 21/06/2026
**Développeur :** Achraf Benamrane

---

## ✅ Travail effectué

### 🛍️ Linky

**Commits :**

- `bed4389` — fix(UX) : actions sur ses **propres annonces** (boutique / produit / propriété → bouton « Gérer » au lieu de Contacter / Acheter / Suivre)
- `5964660` — feat(auth) : **connexion directe** pour un compte existant (`was_created`) — plus de ré-inscription ni d'écrasement du profil
- `a002239` — feat(favoris) : **backend favoris propriétés** (table + RPC + edge function, miroir des produits)
- `a00be02` — feat(Découvrir) : **likes persistants** + **swipe manuel** des photos + **CTA vert** + retrait du bouton « Détails » redondant
- `08e6f2d` — fix(UI) : **contraste des icônes en mode sombre** (cœur des cartes + retour / partage boutique)

**Fonctionnalités / améliorations :**

- **Email OTP réel en production** — Gmail SMTP via le relais landing, **5/5 envois OK (HTTP 200)**, livraison réelle active (fin du code de dev).
- **Connexion sans ré-inscription** : un email / téléphone déjà enregistré ramène **directement** à son compte (« Bon retour »), sans repasser par la création de profil.
- **Découvrir (reels)** : likes désormais **persistants** (ils s'incrémentent réellement), **défilement manuel** entre les photos (fin de l'auto-rotation toutes les 4 s), bouton « Voir le détail » en **vert**, rail d'actions simplifié.
- **Mode sombre** : icônes blanches invisibles corrigées (cœurs des cartes, retour, partage).
- **APK v5** générée (EAS, compte expoborz) et **publiée sur la landing** (`linky-gn.vercel.app/linky.apk`) — installation / mise à jour sans désinstaller.


**Bugs corrigés :**

- **Icônes blanches invisibles** en mode sombre (cœurs, retour, partage).
- **Actions sur ses propres annonces** (erreur « impossible de discuter avec soi-même »).
- **Likes Découvrir** qui ne s'incrémentaient pas (état purement local auparavant).
- **Écrasement du profil** (nom / rôle) lors de la reconnexion d'un compte existant.

### 📋 Coordination

- **Réunion avec le client Linky** : démonstration de l'avancement de l'application. **Le client est satisfait — retour très positif.** ✅
- **Nouvelles demandes** recueillies (voir ci-dessous).

---

## 🆕 Nouvelles demandes du client (réunion du 21/06)

- **Espace livreur (web) complet**, connecté au backend.
- **Inversion du système de validation par QR code** : plutôt que d'**imprimer des étiquettes** à coller sur le colis, c'est le **livreur** qui **scanne** — depuis son espace web — le **QR code affiché sur l'écran du client** (QR déjà généré au moment où le client lance la commande).
- Ajustements de **placement de certains boutons**.
- *Note interne :* évolution d'infrastructure prévue pour intégrer ce nouveau périmètre (espace livreur web) — léger changement d'environnement de développement à anticiper.

---

## 🚧 En cours

> - **Espace livreur web** (nouvelle demande) — conception à démarrer + branchement au backend.
> - **Inversion du flux QR** (le livreur scanne le QR affiché chez le client) — adaptation du système de validation existant.
> - **Nettoyage des données de test** (passage en production) — différé par le propriétaire, script SQL prêt à exécuter.

---

## 🚧 Blocages

- **Téléphone OTP** : pas encore de fournisseur **SMS** (Orange / Twilio) → code de dev en attendant le compte client.
- **Notifications push** : en attente de la **clé APNS** (iOS) et du **google-services.json** (Android).
- **Email** : l'envoi SMTP fonctionne (5/5) ; **délivrabilité inbox** à confirmer définitivement.

---

## 💬 Message pour le client

> **Linky** : l'**email OTP réel** est désormais en production, la **connexion** est simplifiée (un compte existant se reconnecte directement, sans créer de doublon), le module **Découvrir** a été amélioré (likes persistants, défilement manuel des photos) et plusieurs **correctifs d'interface** ont été livrés. La **nouvelle APK est en ligne** sur la landing page.
>
> Ravi que l'avancement vous convienne. Je démarre l'**espace livreur web** et l'**inversion du QR code** (le livreur scanne le QR affiché sur l'écran du client, sans étiquette à imprimer) comme convenu en réunion.

---

## 📊 Suivi

| Indicateur             | Valeur |
| ---------------------- | ------ |
| ⏱️ Heures travaillées  | `8` h  |
| 🖥️ Avancement Frontend | `90` % |
| ⚙️ Avancement Backend  | `88` % |
