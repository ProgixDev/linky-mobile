# -*- coding: utf-8 -*-
"""Consigne le piège OTA du 2026-09-27 dans le runbook de déploiement."""
import io

P = (r'C:\Users\Omen\.claude\projects\c--Users-Omen-Documents-projects'
     r'\memory\reference_edge_deploy_runbook.md')

ANCHOR = '**Deployer une edge fn**'

NOTE = r'''**⚠ Piege OTA rencontre le 2026-09-27** : un `npm run ship` qui echoue laisse ses processus node VIVANTS (npm, eas-cli, expo export). Ils tiennent `%TEMP%\metro-cache`, et la tentative suivante meurt sur `ENOTEMPTY: directory not empty, rmdir metro-cache\18`. Vider le cache ne suffit PAS tant qu'ils tournent — le `Remove-Item` echoue lui aussi. Remede : `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` pour reperer les processus RECENTS (comparer `CreationDate`) dont la ligne de commande contient `ship`, `eas-cli` ou `expo`, les `Stop-Process -Force`, PUIS supprimer le cache, puis relancer. Ne jamais tuer aveuglement tous les `node.exe` : d'autres outils (AmazonQ) en font tourner en permanence depuis des heures, et l'age du processus est ce qui les distingue.

'''

s = io.open(P, encoding='utf-8').read()
assert s.count(ANCHOR) >= 1
io.open(P, 'w', encoding='utf-8', newline='').write(s.replace(ANCHOR, NOTE + ANCHOR, 1))
print('runbook mis a jour')
