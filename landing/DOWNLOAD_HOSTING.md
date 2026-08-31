# Où vit l'APK derrière `linkygroup.com/linky.apk`

## État actuel (depuis le 17 août 2026) — stable, pas de date de péremption

`/linky.apk` **redirige vers la release GitHub la plus récente** du dépôt public
`ProgixDev/linky-downloads` :

```
https://github.com/ProgixDev/linky-downloads/releases/latest/download/linky.apk
```

`releases/latest` résout automatiquement vers la dernière release publiée (non-brouillon,
non-prérelease) — publier une nouvelle release suffit, aucune modification de
`vercel.json` n'est nécessaire.

## Publier un nouveau build

```
eas build --platform android --profile preview
# puis, une fois le .apk telecharge :
gh release create vX.Y.Z <chemin-vers-le.apk>#linky.apk \
  --repo ProgixDev/linky-downloads \
  --title "Linky X.Y.Z (Android) — <resume court>" \
  --notes "<notes de version>"
```

Le nom de l'asset doit rester exactement `linky.apk` (c'est ce que le lien
`releases/latest/download/linky.apk` demande).

## Historique — pourquoi ce n'est ni Vercel Blob ni un artefact EAS

1. **Vercel Blob** (`njii6olstwjlpvas`) a été **suspendu** par Vercel
   (`BlobStoreSuspendedError`) — plus personne ne pouvait télécharger l'application.
2. **Repli provisoire (7 août)** : redirection vers l'artefact EAS du dernier
   build. Ça marchait, mais un artefact EAS **expire 30 jours après le
   build** — pas une solution durable, il aurait fallu republier avant chaque
   expiration.
3. **Solution actuelle (17 août)** : une release GitHub par build, le lien
   pointe toujours sur "latest". Ni expiration, ni dépendance à un store
   tiers, ni modification de code à chaque nouveau build.

Au passage, `/linky.apk` est une **redirection (302)**, pas un *rewrite* : le
navigateur va chercher le fichier directement chez GitHub (un seul transfert,
pas de relais facturé par Vercel). Combiné à l'abandon des architectures
x86/x86_64 dans l'APK (émulateur uniquement, 103 Mo de poids mort — voir
`android/gradle.properties`), le poids d'un téléchargement est passé de 502 Mo
à 137 Mo.

## `/linky-driver.apk` est toujours cassé

Il pointe encore vers le magasin Blob suspendu, et il n'existe pas d'artefact
récent pour l'application livreur (construite depuis un dépôt séparé). À
reconnecter le jour où un build livreur sort — même mécanisme (release GitHub)
recommandé plutôt que de rouvrir Blob.
