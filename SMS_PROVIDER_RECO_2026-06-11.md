# Recommandation fournisseur SMS OTP — Guinée (+224)

**Date : 11 juin 2026 · Contexte : envoi des codes de connexion (OTP) aux utilisateurs Linky sur Orange Guinée et MTN Guinée.**

## Comparatif

| Critère | Orange SMS API (Guinée) | Twilio | Africa's Talking |
|---|---|---|---|
| Livraison vers Orange GN | ✅ Route locale (opérateur du pays) | ✅ Avec réserves | ⚠️ Non documentée |
| Livraison vers MTN GN | ✅ « tout opérateur » annoncé | ⚠️ Sender ID pré-enregistré obligatoire (~3 semaines) | ⚠️ Non documentée |
| Prix / SMS | **≈ 150 GNF (~0,017 $)** au palier 5 000 SMS ; 200 GNF au palier 500 | **0,2788 $** (tarif unique Guinée) ; Verify : +0,05 $/vérification | ❓ Invérifiable (page tarifs inaccessible, la Guinée absente de la couverture documentée) |
| Nom d'expéditeur (sender ID) | Personnalisable, **gratuit** (formulaire) | Alphanumérique uniquement après pré-enregistrement ; IDs génériques risquent le blocage | Procédure Guinée non documentée |
| Environnement de test | Pack découverte 15 SMS (1 200 GNF) — pas de vrai sandbox | Compte d'essai avec crédit (numéros vérifiés seulement) | ✅ Sandbox + simulateur gratuits |
| Facturation | GNF, via **Orange Money** (SIM guinéenne requise) | USD, carte bancaire | USD |
| Contraintes notables | Validité des packs 30–60 j ; plafond 5 req/s | Pas de SMS concaténés en Guinée ; pas de two-way | Présence francophone limitée à la Côte d'Ivoire |

## Estimation mensuelle (OTP ≈ 1 SMS)

| Volume | Orange SMS API | Twilio (Messaging) | Twilio Verify |
|---|---|---|---|
| 1 000 OTP/mois | ≈ 200 000 GNF (**~23 $**) en packs de 500 | ~279 $ | ~329 $ |
| 10 000 OTP/mois | 1 500 000 GNF (**~173 $**) en packs de 5 000 | ~2 788 $ | ~3 288 $ |

*(Conversion indicative : 1 $ ≈ 8 650 GNF, juin 2026.)*

## Recommandation

**Choisir l'Orange SMS API comme canal principal.** C'est environ **16× moins cher** que Twilio, avec des routes locales vers les deux réseaux du pays, un nom d'expéditeur « Linky » gratuit, et une facturation en GNF via Orange Money — un rail que Linky utilise déjà. Les contraintes (packs à validité limitée, 5 req/s, documentation plus légère) sont sans impact au volume V1.

**Garder Twilio en secours (failover)** pour la résilience : lancer **dès maintenant** le pré-enregistrement du sender ID alphanumérique « Linky » (délai ~3 semaines), et utiliser Programmable Messaging brut plutôt que Verify (notre OTP est déjà géré côté backend — Verify ferait double emploi et coûte plus cher).

**Écarter Africa's Talking** : la Guinée n'apparaît pas dans sa couverture documentée et ses tarifs pour le pays sont invérifiables.

### Prochaines étapes proposées
1. Créer le compte Orange Developer + associer un compte Orange Money guinéen (action client — nécessite une SIM Orange GN).
2. Demander le nom d'expéditeur « Linky » (formulaire Orange, gratuit).
3. Pack découverte (1 200 GNF) pour valider la livraison réelle vers un numéro Orange ET un numéro MTN.
4. En parallèle : compte Twilio + dossier de pré-enregistrement du sender ID (failover).

## Sources
- Tarifs Twilio Guinée : https://www.twilio.com/en-us/sms/pricing/gn
- Règles sender ID Twilio Guinée : https://www.twilio.com/en-us/guidelines/gn/sms
- Tarifs Twilio Verify : https://www.twilio.com/en-us/verify/pricing
- Orange SMS API Guinée (offre + tarifs) : https://developer.orange.com/apis/sms-gn · https://developer.orange.com/apis/sms-gn/pricing
- Couverture Africa's Talking : https://help.africastalking.com/en/articles/2727792 · sandbox : https://help.africastalking.com/en/articles/1170660
