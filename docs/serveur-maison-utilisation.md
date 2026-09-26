# Utiliser le serveur maison Ignitux

Suite de `docs/serveur-maison-installation.md`, une fois tout installé.

## Voir l'état du serveur

Tableau de bord : `http://<adresse-Tailscale-du-serveur>:3210` — version
déployée, dernier commit, date de la dernière mise à jour automatique, état
des conteneurs, CPU, RAM.

## Utiliser le partage de fichiers

Depuis un appareil connecté à Tailscale :

- Windows : ouvrir `\\<adresse-Tailscale-du-serveur>\Ignitux` dans
  l'Explorateur (ou le lecteur réseau de ton choix).
- macOS : Finder → **Aller** → **Se connecter au serveur** →
  `smb://<adresse-Tailscale-du-serveur>/Ignitux`.
- Identifiants demandés : ceux du compte Windows utilisé lors de
  l'installation, sur le PC serveur.

**Ce dossier est réservé à Ignitux** — jamais de photos, documents ou
fichiers personnels/familiaux dedans. Il n'est joignable que depuis le
tailnet : ni depuis le Wi-Fi de la maison, ni depuis Internet.

## Lire les journaux

Sur le PC serveur, dans `serveur-maison\journaux\` :

- `maj-automatique.log` — chaque passage qui a trouvé quelque chose de neuf
  (les passages « rien de nouveau » ne sont pas journalisés, pour ne pas
  noyer le fichier — un silence de plus de 5-10 minutes veut donc dire que la
  tâche planifiée elle-même ne tourne pas, pas qu'il ne s'est rien passé).
- `sauvegarde.log` — chaque sauvegarde quotidienne, réussie ou en erreur.
- `etat.json` — le dernier état connu, lu par le tableau de bord.

## Forcer une mise à jour immédiate

Sans attendre le prochain passage des 5 minutes :

```powershell
cd serveur-maison
.\maj-automatique.ps1
```

## Mettre en pause la mise à jour automatique

Pour déboguer à la main sur le serveur sans qu'un `git pull` ne vienne
changer les fichiers sous toi :

```powershell
Disable-ScheduledTask -TaskName 'Ignitux - Mise a jour automatique'
# … travail manuel …
Enable-ScheduledTask -TaskName 'Ignitux - Mise a jour automatique'
```

## Voir ce que Docker Compose voit

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

## Restaurer une sauvegarde

Les sauvegardes chiffrées vivent dans `..\ignitux-sauvegardes\` (hors du
dépôt). Pour en lire une :

```powershell
cd serveur-maison
. .\configuration.ps1   # résout $OpenSSL et $DossierSauvegardes, même sans openssl sur le PATH

$plusRecente = Get-ChildItem $DossierSauvegardes -Filter '*.zip.enc' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

& $OpenSSL enc -d -aes-256-cbc -pbkdf2 -in $plusRecente.FullName -out restauree.zip -pass "file:$FichierPassePhrase"
Expand-Archive restauree.zip -DestinationPath restauree
```

Le dossier obtenu contient un `<table>.json` par table (voir
`backend/scripts/sauvegarde.mjs`) et un dossier `configuration\` avec les
`.env` de l'époque. Il n'existe pas aujourd'hui de script de restauration
automatique vers une base vivante — c'est un export de données à relire, pas
un `pg_restore` en un clic. Supprimer `restauree.zip`/`restauree\` une fois
fini : ce sont des données réelles en clair sur le disque.

## Ce que la sauvegarde quotidienne couvre — et ne couvre pas

Base de données (toutes les tables, via `sauvegarde.mjs`) et configuration
(`.env.docker`, `backend\.env`). Il n'existe aujourd'hui aucun stockage de
fichiers utilisateurs sur disque dans Ignitux — tout vit dans Postgres — donc
il n'y a rien d'autre à couvrir tant que ça reste vrai.

C'est une protection **locale uniquement** : elle ne protège pas contre un
incendie, un vol ou une panne matérielle de ce PC, qui emporterait les
données et leurs sauvegardes ensemble. Une copie hors site est une
amélioration future, qui suppose de choisir et payer un prestataire de
stockage.

## Changer l'adresse Tailscale ou tout autre réglage gravé au build

`NEXT_PUBLIC_API_URL` est gravée dans le paquet de l'interface au moment du
build (voir `frontend/Dockerfile`). La changer dans `.env.docker` ne suffit
pas :

```powershell
docker compose --env-file .env.docker up -d --build frontend
```

## Désinstaller le tableau de bord

```powershell
cd serveur-maison\tableau-de-bord
npm run desinstaller-service
```

## Retirer complètement les tâches planifiées

```powershell
Unregister-ScheduledTask -TaskName 'Ignitux - Mise a jour automatique' -Confirm:$false
Unregister-ScheduledTask -TaskName 'Ignitux - Sauvegarde quotidienne' -Confirm:$false
```
