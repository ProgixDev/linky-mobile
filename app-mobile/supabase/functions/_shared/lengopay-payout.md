# Lengopay — PayOut (versement sortant)

Relevé le **2026-10-14** dans le portail marchand Lengopay, *Mode développeur →
« Make payments (Cash Out) »*. Cette documentation **n'est pas publique** : elle
n'existe que derrière la connexion marchand. D'où ce fichier.

> ⚠ Ne pas confondre avec « Cashout » de leur documentation publique, qui est un
> **encaissement**. Le versement, c'est `/api/v2/payout/request` et rien d'autre.

---

## Le point d'entrée

```
POST https://portal.lengopay.com/api/v2/payout/request
```

### En-têtes

| En-tête | Valeur |
|---|---|
| `Authorization` | `Basic {License key}` — **la même clé que l'encaissement** |
| `Accept` | `application/json` |
| `Content-Type` | `application/json` |

### Corps

| Champ | Exemple | Note |
|---|---|---|
| `amount` | `"1000"` | **chaîne**, pas un nombre |
| `currency` | `"GNF"` | |
| `websiteid` | `"gboerA8juxk2XwN8"` | le même que l'encaissement |
| `type_account` | `"lp-om-gn"` · `"lp-momo-gn"` | Orange Money, MTN |
| `account` | `"620124578"` | le numéro **qui reçoit** l'argent |
| `callback_url` | `https://…` | facultatif, mais **HTTPS obligatoire** |

### Réponse

```json
{
  "status": "INITIATED",
  "pay_id": "elNZc1FUZzduVzhQcjlYVWtkZ2pmVmRac1Z5anUxUG8",
  "message": "Request received successfully"
}
```

`pay_id` est encodé en base64 et n'est présent qu'en cas de succès.

---

## Le rappel (callback)

Si `callback_url` est fournie, Lengopay y envoie un `POST` :

| Champ | Exemple |
|---|---|
| `pay_id` | `RzFmb1JvVWwxWFJQaXBCaXFFWM` |
| `status` | `SUCCESS` · `FAILED` |
| `amount` | `1000` — ⚠ **nombre ici**, alors que la requête l'envoie en chaîne |
| `message` | `Transaction Successful` |
| `account` | `620124578` — le numéro destinataire |

**Rejeu** : *« Si la notification à votre callback_url échoue, le serveur
réessaiera pendant une période limitée. »* La durée n'est pas précisée — à
demander.

---

## Erreurs

| Code | Sens |
|---|---|
| `400` | Requête mal formée ou paramètres manquants |
| `401` | Jeton d'authentification invalide ou manquant |

Leurs propres remarques : `amount` doit être une chaîne numérique valide,
`currency` un code pris en charge, `websiteid` un site enregistré,
`type_account` un type valide, et `callback_url` une URL **HTTPS**.

---

## ⚠ Les trois manques, et ce qu'ils coûtent

**1. Aucune clé d'idempotence.** Rien dans la requête ne permet de dire « c'est
le même versement que tout à l'heure ». Si notre appel part deux fois — nouvelle
tentative après un délai dépassé, par exemple — **rien chez eux n'empêche de
payer deux fois**. La protection doit donc vivre entièrement chez nous : un seul
versement par demande de retrait, verrouillé en base avant l'appel.

**2. Le rappel n'est pas signé.** Aucun en-tête de signature n'est documenté.
N'importe qui connaissant l'URL peut donc poster un `SUCCESS`. Il faut
**re-vérifier le statut auprès de Lengopay** avant de marquer un retrait payé,
ou au minimum n'accepter que des `pay_id` qu'on a nous-mêmes créés et qui sont
encore en attente.

**3. Le solde de la caisse n'est pas vérifié à l'appel.** La caisse Pay Out se
lit par `GET /api/getbalance/{websiteid}` (le champ `balance` est un objet
`{"Pay In": …, "Pay Out": …}`). Rien n'indique ce que fait un versement
supérieur au solde — à demander, et à garder en tête : un versement refusé faute
de provision ne doit pas laisser une demande de retrait bloquée.

---

## État constaté le 2026-10-14

Sur le tableau de bord marchand, compte **LINKY** (Easy Link Guinea) :

| | |
|---|---|
| Caisse **Pay Out** | **60 000 GNF** — elle était à 0 le 29/09, elle est donc alimentée |
| Caisse Pay In | 4 057 GNF |
| Transactions | 162 au total |
| Taux de succès | **20,8 %** — 10 réussies parmi les terminées |
| Retrait effectué | 0 |

⚠ **Le taux de succès de 20,8 % concerne l'ENCAISSEMENT et mérite son propre
examen.** Dix paiements réussis sur 162 tentatives, ce n'est pas un détail
d'intégration : soit les acheteurs abandonnent, soit un rail refuse
silencieusement. La dernière transaction du 26 septembre, 172 500 GNF, est en
échec.
