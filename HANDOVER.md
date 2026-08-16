# Passation — Linky

Le `README.md` de `app-mobile/` couvre la stack, la structure et comment lancer
le projet. **Ce fichier-ci couvre ce que le code ne dit pas** : les pièges qui
font perdre une journée, ce qui n'est pas déployé, et les accès à demander.

Lis-le en entier avant ta première modification en production. Les avertissements
en gras sont là parce que le cas s'est déjà produit.

---

## 0. Le piège d'entrée

**Le dépôt git n'est pas à la racine du dossier.** Il est dans `linky-mobile/`.
Une commande git lancée depuis `linky/` remonte au dépôt parent et échoue avec
`src refspec ... does not match any`. Place-toi toujours dans `linky-mobile/`.

Trois surfaces dans le même dépôt :

| Dossier | Quoi | Déploiement |
|---|---|---|
| `app-mobile/` | l'app Expo + les fonctions edge + les migrations | EAS / Supabase |
| `admin/` | console d'administration (Next.js) | Vercel |
| `landing/` | site public linkygroup.com | Vercel |

---

## 1. Base de données — `supabase db push` est INUTILISABLE

Les versions de migration côté production ne correspondent pas aux noms de
fichiers locaux. La CLI propose une commande de « réparation » : **ne la lance
pas**, elle réécrit l'historique distant.

**Applique toute migration à la main**, via l'éditeur SQL du projet Supabase, en
copiant le fichier `app-mobile/supabase/migrations/<date>_<n>_<nom>.sql`. Les
fichiers sont écrits pour être collés tels quels et sont idempotents autant que
possible.

### Migrations écrites mais PAS encore appliquées

À vérifier avant de supposer qu'une fonctionnalité marche :

- `20260812_01_boost_mobile_money.sql` — boost payable par Orange Money / MTN.
  Tant qu'elle n'est pas passée, choisir « Orange Money » sur l'écran de boost
  échoue : l'app appelle des routines qui n'existent pas encore.
- `20260619_01` — libération du séquestre sur les commandes expédiées.

**L'ordre compte** : migration d'abord, déploiement des fonctions ensuite. Les
fonctions appellent les nouvelles routines.

---

## 2. Fonctions edge — deux règles non négociables

### `verify_jwt` doit être `false`, partout

L'authentification est **maison** (JWT HS256 signés par nous, pas par Supabase).
Une fonction déployée avec `verify_jwt = true` renvoie 401 à *tous* les
utilisateurs. C'est déjà arrivé : le 09/06/2026, 12 fonctions de production sont
tombées d'un coup.

`supabase/config.toml` épingle `verify_jwt = false` pour les 130 fonctions.
**Toute nouvelle fonction doit y être ajoutée** — sinon le déploiement applique
la valeur par défaut, qui est `true`.

Vérifier la couverture :

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('supabase/config.toml','utf8');const p=new Set([...t.matchAll(/\[functions\.([a-zA-Z0-9_-]+)\]/g)].map(m=>m[1]));const d=fs.readdirSync('supabase/functions',{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('_')).map(x=>x.name);console.log(d.filter(x=>!p.has(x)))"
```

Sonder une fonction en production (un jeton bidon suffit) :

```bash
curl -s -X POST "https://<ref>.supabase.co/functions/v1/<fonction>" \
  -H "Authorization: Bearer garbage.token.here" -H "Content-Type: application/json" -d '{}'
```

Une réponse `{"error":{"code":...}}` vient de **notre** code → correct.
Un 401 `Invalid JWT` vient de la passerelle Supabase → la fonction est cassée.

### Déployer

Utilise `app-mobile/scripts/deploy-edge.ps1`. Il faut `SB_DEPLOY_TOKEN` dans
l'environnement : **le jeton présent dans `.env` n'a pas les droits de
déploiement sur la production** et renvoie 403.

---

## 3. Sécurité de la base — à ne pas défaire par accident

Le 29/07/2026, les droits `EXECUTE` publics ont été retirés sur les 47 routines
`SECURITY DEFINER`. C'est sûr **uniquement parce que l'application ne les appelle
jamais directement** — tout passe par les fonctions edge en `service_role`.

**Supabase ré-accorde `EXECUTE` à `anon` et `authenticated` par défaut sur toute
nouvelle routine `SECURITY DEFINER`.** Chaque migration qui en crée une doit donc
finir par :

```sql
revoke all on function public.<nom>(<types>) from public, anon, authenticated;
grant execute on function public.<nom>(<types>) to service_role;
```

Oublier ce bloc ouvre la routine à Internet.

---

## 4. Application mobile — asymétrie Android / iOS

**Android est en mode BARE** : le dossier `android/` est versionné, donc
`app.json` est **ignoré** pour tout ce qui est natif.

- la version monte dans `android/app/build.gradle`, pas dans `app.json`
- `google-services.json` doit être forcé : `git add -f android/app/google-services.json`

**iOS est en mode MANAGED** : il n'y a pas de dossier `ios/`, donc `app.json`
**est** la source de vérité et le projet natif est régénéré à chaque build.
Modifier un projet Xcode à la main ne sert à rien, il sera écrasé.

### Permissions iOS — le piège des valeurs par défaut

Les plugins Expo écrivent leur texte **par défaut, en anglais**, quand on ne leur
passe rien. Une propriété laissée indéfinie ne veut pas dire « ignore », elle
veut dire « écris la valeur anglaise d'Apple ». Seul un `false` explicite retire
la clé. C'est un motif de refus en revue Apple. Corrigé le 12/08 pour le micro,
Face ID et la localisation permanente — **applique la même vigilance à tout
nouveau plugin**.

### Mises à jour à distance (OTA)

```bash
npx eas update --branch preview --platform all --environment preview
```

**`EXPO_PUBLIC_*` doit exister dans l'environnement EAS `preview`**, sinon le
bundle part sans configuration et l'app s'ouvre sur « Configuration manquante ».

Historiquement les publications étaient faites avec `--platform android`. Depuis
le premier build iOS, utilise `--platform all`, sinon les testeurs iPhone ne
reçoivent jamais les correctifs.

---

## 5. Console d'administration — le déploiement automatique est cassé

Il y a **deux projets Vercel** : `linky-admin` (le vrai) et `admin-beta`. La
liaison entre l'organisation Vercel et GitHub a expiré, donc **pousser sur `main`
ne déploie plus l'admin**. Déploie à la main, depuis la racine du dépôt :

```bash
vercel link --project linky-admin
vercel --prod
```

---

## 6. Paiements et vérification d'identité

- **Rails actifs** : portefeuille interne, Orange Money et MTN via **Lengopay**.
- **Stripe est ABANDONNÉ** (juillet 2026) : pas de compte actif, et les cartes
  guinéennes sont refusées. Du code Stripe subsiste, ne le réactive pas.
- **Le portefeuille est en lecture seule** côté transferts entre personnes. Les
  envois d'argent d'utilisateur à utilisateur ont été **retirés** en juillet 2026
  : hors contrat, et cela exigerait une licence d'établissement de paiement
  auprès de la banque centrale guinéenne. **Ne les réactive pas sans licence.**
- **OTP téléphone : Prelude.** Piège majeur — l'API répond **HTTP 200 même pour
  un code faux**. Seul `status === 'success'` authentifie. Une implémentation qui
  se fierait au code HTTP laisserait entrer n'importe qui.
- **KYC : Didit.** Il ne bloque plus la publication d'une annonce (demande client
  du 05/08). Ne réintroduis pas de blocage KYC ailleurs sans validation.

---

## 7. À retirer avant le lancement

Des échafaudages de test sont encore en place parce que le client teste :

- déclencheur de démonstration qui **crédite automatiquement 100 M GNF** au
  portefeuille à la création du compte
- code de développement affiché pour l'OTP téléphone

---

## 8. Accès à demander — le dépôt ne suffit pas

Le code est la partie facile. Sans ces accès, tu ne peux ni déployer ni
diagnostiquer :

| Service | Pour quoi |
|---|---|
| **Supabase** | base, fonctions edge, secrets, journaux |
| **Expo / EAS** (org `linkyorg`) | builds et mises à jour à distance |
| **Vercel** | site public et console d'administration |
| **Prelude** | OTP téléphone |
| **Lengopay** | Orange Money / MTN |
| **Didit** | vérification d'identité |
| **Apple Developer** | builds iOS et TestFlight |
| **Google Play** | `com.linkygroup.app` |

### Les secrets ne sont pas dans le dépôt et ne doivent jamais y entrer

`app-mobile/.env.example` liste les variables attendues, **sans valeurs**.

Une trentaine de secrets serveur vivent uniquement dans Supabase, qui n'en
renvoie que des empreintes — **aucun outil ne peut les exporter**. Ils doivent
être relus dans les consoles d'origine.

Cinq n'existent **nulle part ailleurs** que dans Supabase, ils ont été générés
pour Linky. Les perdre déconnecte tous les utilisateurs :

```
LINKY_JWT_SECRET   LINKY_OTP_HMAC_SECRET   LINKY_ADMIN_SECRET
LINKY_CRON_SECRET  OTP_EMAIL_SECRET
```

Transmets-les par un coffre-fort, **jamais par message ni dans un fichier du
dépôt**. `.gitignore` couvre `.env*`, `*.p8` et `AuthKey_*` — vérifie avant tout
`git add -A` que rien de sensible n'est mis en scène.

---

## 9. Où trouver le reste

- `app-mobile/README.md` — stack, structure, commandes
- `PUSH_SETUP.md` — notifications
- `ROTATION_LOG.md` — historique des rotations de clés
- `PHASE_K_V1_1_BACKLOG.md`, `WALLET_SEND_V1_1_BACKLOG.md` — reporté après V1
- les rapports quotidiens `Daily_Shift_Report_*.md` — le journal de ce qui a été
  fait, jour par jour, avec les causes racines des bugs corrigés
