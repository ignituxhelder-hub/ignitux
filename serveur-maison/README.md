# Serveur maison Ignitux

Scripts et configuration pour transformer un PC Windows 11, chez toi, en
serveur de **développement/prévisualisation** Ignitux, toujours à jour et
joignable à distance par Tailscale.

Ce n'est **pas** l'hébergement de production — celui-ci reste prévu sur une
plateforme cloud (voir `docs/hebergement.md`, `docs/deployer.md`). Ce dossier
sert un besoin différent : pouvoir développer en déplacement, pousser sur
GitHub, et retrouver Ignitux à jour chez soi sans y toucher à la main.

**Documentation complète** : `docs/serveur-maison-installation.md` (à suivre
une fois, sur le PC serveur) et `docs/serveur-maison-utilisation.md` (au
quotidien, une fois installé).

## Contenu

| Fichier | Rôle |
|---|---|
| `installer.ps1` | Geste unique : outils, dépôt, configuration, pare-feu, tâches planifiées. |
| `configuration.ps1` | Chemins et réglages partagés par tous les autres scripts. |
| `pare-feu.ps1` | Règles de pare-feu Windows, bornées au tailnet Tailscale. |
| `planifier-taches.ps1` | Enregistre les tâches planifiées (mise à jour, sauvegarde). |
| `maj-automatique.ps1` | Vérifie GitHub, tire les nouveaux commits, reconstruit et redémarre Docker. |
| `sauvegarde-quotidienne.ps1` | Sauvegarde chiffrée quotidienne (base + configuration). |
| `tableau-de-bord/` | Petit serveur Node : version déployée, conteneurs, CPU, RAM. |
| `journaux/` | Journaux et état, générés à l'exécution — jamais versionnés. |

Rien ici ne s'exécute seul avant `installer.ps1` — lire d'abord
`docs/serveur-maison-installation.md`.
