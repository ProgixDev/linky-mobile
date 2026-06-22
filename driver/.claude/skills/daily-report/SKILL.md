---
name: daily-report
description: Write today's daily report in FRENCH, organized by project, under docs/reports/daily/. Use when the user says "daily report", "rapport quotidien", "standup", "what did I do today/yesterday", or wants a log of what changed. Built so nothing gets forgotten.
argument-hint: [optional date YYYY-MM-DD, default today]
allowed-tools: Read, Write, Glob, Grep, Bash(git log*), Bash(git diff*), Bash(git status*), Bash(date*)
---

## Contexte (collecté avant lecture)

- Aujourd'hui : !`date +%F`
- Commits depuis minuit : !`git log --since=midnight --pretty=format:'%h %s (%an)' 2>/dev/null | head -50`
- Fichiers modifiés aujourd'hui : !`git log --since=midnight --stat --oneline 2>/dev/null | tail -60`
- En cours, non commité : !`git status --short 2>/dev/null | head -40`
- Nom du projet : !`basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`

## Tâche

Écris `docs/reports/daily/<date>.md` (date = `$ARGUMENTS` ou aujourd'hui) **en français**, en suivant
EXACTEMENT le modèle `docs/templates/daily-report.md`. Le fichier est **classé par projet, une partie
par projet** (`## <Nom du projet>`).

Pour le projet courant, à partir du contexte git ci-dessus (ne jamais inventer d'activité) :

1. **Travail effectué** — liste simple et lisible : fonctionnalités développées, bugs corrigés
   (traduits en langage humain, pas en hashes de commit).
2. **Ce qui est en cours** — la tâche en cours actuellement + le blocage éventuel sur cette tâche.
3. **Les blocages** — problème technique, attente de validation client, ou autre.
4. **Message pour le client** — un message clair et professionnel **que TU rédiges** au vu du
   rapport, prêt à envoyer (français, ton courtois, sans jargon technique).
5. **À remplir à la main** — laisse les champs vides : heures passées, avancement front (%),
   avancement back (%) (par tranche de 10). Ne les devine pas.

Règles :

- **Si le fichier du jour existe déjà**, mets à jour / ajoute uniquement la partie du projet courant
  et conserve les autres parties (projets) intactes.
- Garde-le court et honnête : lisible en moins d'une minute. Liens vers commits/fichiers, pas de diff inline.
- Écris le fichier, puis **renvoie seulement le chemin du fichier + 3 puces de résumé** (ne recopie
  pas tout le rapport dans le chat).

Astuce : se planifie bien en tâche programmée (« écris mon rapport quotidien chaque soir »).
