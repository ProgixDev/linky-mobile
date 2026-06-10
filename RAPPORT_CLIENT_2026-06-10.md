# Linky — Point d'avancement · 10 juin 2026

**Statut global : 🟢 VERT — lancement avant septembre 2026 maintenu.**

Trois modules majeurs ont été livrés cette semaine, dont deux étaient des demandes directes de votre part lors de la réunion du 29 mai (vérification d'identité par API, paiement par carte).

---

## Livré cette semaine

### 1. Notifications (push + centre de notifications)
Les utilisateurs sont maintenant prévenus en temps réel, même hors de l'application : commande payée, message reçu, visite acceptée ou refusée, litige ouvert ou tranché, fonds libérés. L'écran « Notifications » de l'application affiche le même fil, et la pastille rouge sur la cloche reflète désormais les vraies notifications non lues.

### 2. Vérification d'identité (KYC) — demande de la réunion du 29 mai
Le parcours complet est en place : le vendeur scanne sa pièce (CNI, passeport…) et fait un selfie de contrôle ; la vérification automatique (document + visage + test de vie) est assurée par un prestataire spécialisé (Didit — **offre cœur gratuite et illimitée**, meilleure que les 500 utilisations évoquées en réunion). Les cas douteux arrivent dans une file d'examen manuel sur la console d'administration — votre équipe tranche en un clic, et le vendeur reçoit la décision par notification. Une fois vérifié, sa boutique porte le badge **« Vendeur vérifié »**, visible des acheteurs.

### 3. Paiement par carte bancaire (Stripe) — demande de la réunion du 29 mai
Le parcours d'achat accepte désormais **Visa, Mastercard et Google Pay**, pensé pour la diaspora : paiement en GNF, fenêtre de paiement sécurisée, mise en séquestre identique aux autres moyens de paiement. Actuellement en **mode test** (cartes de démonstration) — le passage aux paiements réels se fait par simple changement de clés dès que la structure US (LLC) sera en place. Aucune refonte ne sera nécessaire.

### 4. Fiabilité et exactitude
- Un incident de déploiement (résolu le jour même) a conduit à mettre en place des verrous techniques pour qu'il ne puisse pas se reproduire.
- Audit des montants affichés : partout dans l'application, le vendeur voit désormais le **montant intégral** qu'il recevra — les 3 % de frais Linky sont payés par l'acheteur en sus, conformément au modèle validé.

---

## Démo possible dès maintenant

Scénario de bout en bout sur deux téléphones + la console d'administration :
1. Un vendeur vérifie son identité (scan + selfie) → badge « Vendeur vérifié ».
2. Un acheteur paie une commande **par carte** (carte de test) → fonds en séquestre → le vendeur reçoit la notification « Nouvelle commande payée ».
3. Livraison confirmée par QR code → fonds libérés → notification « Fonds libérés ».
4. En cas de litige : arbitrage depuis la console d'administration → les deux parties sont notifiées instantanément.

---

## Ce que nous attendons de votre côté (inchangé)

| Élément | Débloque |
|---|---|
| Compte Apple Developer | Notifications iPhone + publication App Store |
| Structure US (LLC) + compte Stripe | Paiements par carte **réels** (le code est prêt) |
| Contrat commercial Lengopay | Orange Money / MTN réels (le circuit technique est prêt et testé en simulation) |
| Liste bêta-testeurs (10-20 acheteurs, 3-5 vendeurs, 2 agents à Conakry) | Phase de test réel avant ouverture |
| Logo + palette finale | Habillage définitif avant soumission aux stores |

---

## Prochaines étapes (sans dépendance de votre côté)

- Carte interactive sur les annonces immobilières (position réelle + itinéraire).
- Traitement des retraits vendeurs depuis la console d'administration.
- Choix du fournisseur SMS pour les codes de connexion (recommandation en préparation).
- Durcissement technique pré-lancement (performance 3G, surveillance, sauvegardes).
