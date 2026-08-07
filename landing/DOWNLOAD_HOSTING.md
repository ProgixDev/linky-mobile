# Où vit l'APK derrière `linkygroup.com/linky.apk`

## État au 7 août 2026 — provisoire, avec une date de péremption

`/linky.apk` **redirige vers l'artefact EAS**, pas vers Vercel Blob.

Pourquoi : le magasin Blob `njii6olstwjlpvas` est **suspendu** par Vercel
(`BlobStoreSuspendedError`, en lecture *et* en écriture). Le bouton de
téléchargement du site renvoyait `Your store is blocked` — donc plus personne ne
pouvait installer l'application. La redirection vers EAS rétablit le
téléchargement sans rien coûter, Expo hébergeant déjà le fichier.

> **L'artefact EAS expire le 21 août 2026.** Passé cette date le lien meurt et le
> bouton casse à nouveau. Ce n'est pas une solution durable.

## Remettre les choses d'aplomb

Par ordre de préférence :

1. **Publier sur le Play Store.** Google héberge la distribution gratuitement et
   le problème de bande passante disparaît définitivement. C'est prévu au contrat.
2. **Débloquer le magasin Blob** sur vercel.com (Storage → le magasin →
   la raison de la suspension y est affichée ; côté facturation, voir
   Settings → Billing → Spend Management). Ensuite :
   ```
   BLOB_READ_WRITE_TOKEN=… node scripts/upload-apk.mjs <chemin-du.apk>
   ```
   puis remettre `https://njii6olstwjlpvas.public.blob.vercel-storage.com/linky.apk`
   comme destination dans `vercel.json`. L'URL Blob est stable d'un build à
   l'autre — contrairement à l'URL EAS, qui change à chaque build et impose de
   modifier `vercel.json` puis de redéployer.

## Ce qui a été corrigé au passage

`/linky.apk` et `/linky-driver.apk` étaient des **rewrites**. Vercel *relayait*
donc le fichier : il sortait du stockage **puis** repassait par le réseau Vercel,
soit deux transferts facturés pour un seul téléchargement. Ce sont maintenant des
**redirections** (302) : le navigateur va chercher le fichier directement, un
seul transfert.

Combiné à l'abandon des architectures x86/x86_64 dans l'APK (emulateur
uniquement, 103 Mo de poids mort — voir `android/gradle.properties`), le coût
d'un téléchargement passe de 502 Mo à 137 Mo.

Les en-têtes `Content-Disposition` / `Content-Type` de ces deux chemins ne
s'appliquent plus depuis le passage en redirection — ils portent sur la réponse
302, pas sur le fichier. Le type MIME vient désormais de l'hébergeur ; le script
d'envoi le fixe explicitement à l'upload.

## `/linky-driver.apk` est toujours cassé

Il pointe encore vers le magasin suspendu, et il n'existe pas d'artefact EAS
récent pour l'application livreur (construite depuis un dépôt séparé). À
reconnecter quand le magasin sera débloqué ou qu'un nouveau build livreur sortira.
