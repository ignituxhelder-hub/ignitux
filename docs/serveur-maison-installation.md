# Installer le serveur maison Ignitux

## À qui s'adresse ce document

À toi, **physiquement devant le PC Windows 11 qui deviendra le serveur** —
pas le PC portable sur lequel tu développes. Les commandes ci-dessous
s'exécutent là-bas, dans un PowerShell **vraiment** ouvert en administrateur
(clic droit sur PowerShell → « Exécuter en tant qu'administrateur » — une
fenêtre qui ne le propose pas au démarrage échoue plus tard sur des erreurs
qui n'expliquent pas pourquoi).

## Ce que ça met en place

- Mise à jour automatique : toutes les 5 minutes, le serveur vérifie GitHub,
  tire les nouveaux commits de `main`, reconstruit et redémarre les
  conteneurs Docker qui ont changé.
- Sauvegarde quotidienne chiffrée, à 02h00 (base de données + configuration).
- Un petit tableau de bord (version déployée, conteneurs, CPU, RAM).
- Un accès à distance sécurisé par Tailscale — jamais par une redirection de
  port sur ta box internet.

Ce n'est **pas** l'hébergement de production d'Ignitux, qui reste prévu sur
une plateforme cloud (`docs/hebergement.md`). C'est un serveur de
développement/prévisualisation, chez toi.

## 0. Ce que tu dois déjà avoir

- Windows 11 sur ce PC.
- Une connexion Internet stable (le PC doit rester allumé et connecté).
- **Tailscale** — tu l'installes/le configures toi-même sur ce PC et sur les
  appareils depuis lesquels tu veux atteindre le serveur (ton PC portable,
  ton téléphone). `installer.ps1` ne s'en occupe pas.

## 1. Cloner le dépôt

```powershell
git clone https://github.com/<organisation>/<depot>.git
cd <depot>
```

(Le dépôt Ignitux est **public** : cloner et tirer ne demande aucun
identifiant. Rien n'est écrit à distance depuis ce serveur — il ne fait que
lire.)

## 2. Lancer l'installateur

```powershell
cd serveur-maison
.\installer.ps1
```

Il installe Git/Node.js/Docker Desktop s'ils manquent (par `winget`), crée
`.env.docker` et `backend\.env` à partir des modèles, pose les règles de
pare-feu et enregistre les tâches planifiées. Il **s'arrête et te le dit**
quand quelque chose doit être rempli à la main — ne saute pas ces messages.

Si Docker Desktop vient d'être installé, une fenêtre PowerShell **relance**
est nécessaire (`.\installer.ps1` de nouveau) pour que son PATH soit pris en
compte.

## 3. La configuration (remplie automatiquement par `installer.ps1`)

`installer.ps1` crée `.env.docker` et `backend\.env` (jamais versionnés, voir
`.gitignore`) et remplit lui-même :
- `JWT_SECRET` — généré aléatoirement (sans dépendre d'openssl).
- `NEXT_PUBLIC_API_URL`/`FRONTEND_URL` — posés sur l'adresse **Tailscale**
  détectée de ce PC (`tailscale ip -4`), **si Tailscale est déjà connecté**
  au moment où tu lances le script. `NEXT_PUBLIC_API_URL` est **gravée dans
  le paquet au moment du build** (voir `frontend/Dockerfile`) : si Tailscale
  n'était pas encore connecté, le script te le dit et il faut alors remplir
  ces deux valeurs à la main dans `.env.docker`, avec le résultat de
  `tailscale ip -4` — jamais `http://localhost:3000`, sinon l'interface
  s'appellera elle-même en boucle dès qu'elle sera ouverte depuis un autre
  appareil du tailnet.
- `backend\.env` reçoit les mêmes valeurs (`DATABASE_URL`, `JWT_SECRET`).

Si l'un des deux fichiers existe déjà (relance de l'installateur), il n'est
pas touché.

## 4. Premier démarrage

```powershell
cd ..
docker compose --env-file .env.docker up -d --build
cd backend
npx prisma db push
```

`prisma db push` pose le schéma — un geste explicite, à faire depuis l'hôte
(pas `docker compose exec`, voir les commentaires de `docker-compose.yml`).

Vérifier : `docker compose ps` doit montrer `base`, `backend` et `frontend`
tous « healthy » ou « running ».

**Encore depuis `backend\`, sans quoi la sauvegarde quotidienne échouera
plus tard** : `npm ci` installe les dépendances sur l'hôte (distinctes de
celles du conteneur), puis `npm run build` compile `dist\`. Le script
`scripts/sauvegarde.mjs` importe le client Prisma déjà compilé
(`dist/generated/prisma/client.js`) — sans ce `npm run build` exécuté une
fois sur l'hôte, il ne trouvera rien à importer et la sauvegarde de 02h00
échouera dès la première nuit.

```powershell
npm ci
npm run build
cd ..
```

## 5. La passphrase de sauvegarde (générée automatiquement)

`installer.ps1` la génère lui-même si elle n'existe pas encore
(`..\ignitux-sauvegardes\.passphrase`, jamais versionnée). Pour la voir :

```powershell
Get-Content ..\ignitux-sauvegardes\.passphrase
```

**Mets-en une copie ailleurs aussi** (un gestionnaire de mots de passe, une
clé USB séparée). Sans elle, une sauvegarde chiffrée perdue en même temps
qu'elle est illisible pour toujours.

## 6. Installer le tableau de bord

```powershell
cd serveur-maison\tableau-de-bord
npm install
npm run installer-service
cd ..\..
```

Il tourne alors comme service Windows, sur le port 3210.

## 7. Partage de fichiers (Ignitux uniquement)

```powershell
cd serveur-maison
.\partage-fichiers.ps1
```

Crée `C:\Partage-Ignitux` et le partage réseau qui va avec — accessible
seulement via Tailscale, jamais depuis le Wi-Fi de la maison ni Internet.
**Ce dossier n'est réservé qu'aux fichiers liés à Ignitux** — jamais de
fichiers personnels ou familiaux dedans.

## 8. Vérifier depuis un autre appareil du tailnet

Une fois Tailscale connecté sur ton PC portable ou ton téléphone :

- Interface : `http://<adresse-Tailscale-du-serveur>:3001`
- Tableau de bord : `http://<adresse-Tailscale-du-serveur>:3210`
- Partage de fichiers : `\\<adresse-Tailscale-du-serveur>\Ignitux` (Windows)
  ou `smb://<adresse-Tailscale-du-serveur>/Ignitux` (macOS)

Si ça ne répond pas : vérifier que Tailscale est bien connecté des deux
côtés, puis relire `pare-feu.ps1` (les règles sont bornées à `100.64.0.0/10`
— l'adresse d'où tu testes doit être une adresse Tailscale, pas ton Wi-Fi
local).

## 9. Redémarrage automatique — un compromis à connaître

Docker Desktop tourne dans **la session de l'utilisateur connecté** ; les
tâches planifiées se lancent donc « à la connexion de cet utilisateur », pas
« au démarrage, sans session ». Pour qu'Ignitux revienne seul après une
coupure de courant, deux options :

- **Connexion automatique Windows** pour ce compte (`netplwiz`, décocher
  « les utilisateurs doivent entrer un mot de passe ») — pratique, mais
  n'importe qui avec un accès physique au PC arrive alors sur un compte
  déverrouillé. Acceptable pour un PC chez toi, à évaluer selon ton contexte.
- **Ne rien activer** : après une coupure, se reconnecter une fois — à la
  main, ou par Bureau à distance via Tailscale (qui, lui, démarre bien avant
  toute connexion Windows, donc reste joignable même dans ce cas).

## Et ensuite

Pousser un commit sur `main` depuis ton PC de développement ; dans les 5
minutes, le serveur le récupère seul. Voir
`docs/serveur-maison-utilisation.md` pour le quotidien (lire les journaux,
forcer une mise à jour immédiate, restaurer une sauvegarde, mettre en pause).
