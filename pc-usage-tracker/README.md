# PC Usage Tracker — comptabilisation du serveur IGNITUX

Mesure automatiquement le temps pendant lequel ce PC Windows fait tourner
les conteneurs Docker d'IGNITUX, calcule le montant dû au propriétaire de
la machine, et l'affiche dans un tableau de bord.

## Comment ça marche

1. **Détection** — toutes les `POLL_INTERVAL_MS` (5 s par défaut), le
   service interroge le moteur Docker (via `dockerode`) pour la liste des
   conteneurs en cours d'exécution, et retient ceux dont le nom contient
   `CONTAINER_NAME_FILTER` (`ignitux` par défaut — les noms de conteneurs
   générés par `docker compose` à la racine du dépôt sont préfixés
   `ignitux-...`).
2. **Session** — dès qu'au moins un conteneur IGNITUX est actif et
   qu'aucune session n'est ouverte, une nouvelle session démarre. Tant
   qu'au moins un conteneur reste actif, elle continue (et un échantillon
   CPU/RAM/GPU est relevé à chaque sondage). Dès qu'aucun conteneur
   IGNITUX n'est plus actif, la session se ferme et son montant est
   calculé au tarif qui était en vigueur **à son ouverture**.
3. **Historique** — chaque session (début, fin, durée, conteneurs
   concernés, tarif appliqué, montant, moyennes CPU/RAM/GPU) est conservée
   indéfiniment dans une base SQLite locale.
4. **Tableau de bord** — l'interface React interroge l'API toutes les 5
   secondes et affiche les temps et montants dus (aujourd'hui / semaine /
   mois / total), les moyennes de ressources, et une estimation de la
   consommation électrique.

## Arborescence

```
pc-usage-tracker/
├── server/                  API Express + moteur de détection (TypeScript)
│   ├── src/
│   │   ├── config.ts        Lecture des variables d'environnement
│   │   ├── db/database.ts   Ouverture SQLite + migrations
│   │   ├── docker/          Sondage Docker + filtre par nom de conteneur
│   │   ├── services/        Sessions, statistiques, réglages, ressources
│   │   ├── routes/          Endpoints REST
│   │   ├── windows-service/ Installation/désinstallation du service Windows
│   │   ├── app.ts           Assemblage Express
│   │   └── index.ts         Point d'entrée (démarre le sondage + l'API)
│   ├── tests/                Tests unitaires (Jest)
│   └── Dockerfile
├── web/                      Tableau de bord (React + Vite + TypeScript)
│   ├── src/
│   │   ├── api.ts            Client HTTP vers l'API
│   │   ├── format.ts         Formatage durée/euros/pourcentage
│   │   ├── components/       Dashboard, StatCard, SessionHistoryTable
│   │   └── App.tsx
│   ├── tests/                 Tests unitaires (Vitest + Testing Library)
│   └── Dockerfile
├── docker-compose.yml         Déploiement conteneurisé optionnel
└── package.json               Orchestration (workspaces npm)
```

## Schéma de base de données (SQLite)

**`sessions`** — une ligne par période continue d'activité IGNITUX :

| Colonne             | Type    | Description                                             |
| ------------------- | ------- | --------------------------------------------------------|
| `id`                | INTEGER | Identifiant                                              |
| `service_name`      | TEXT    | Noms des conteneurs actifs, à titre indicatif            |
| `container_names`   | TEXT    | Tableau JSON de tous les conteneurs vus pendant la session |
| `start_time`        | TEXT    | Horodatage ISO 8601 de début                             |
| `end_time`          | TEXT    | Horodatage ISO 8601 de fin (`NULL` si en cours)          |
| `duration_seconds`  | INTEGER | Durée totale, posée à la fermeture                       |
| `hourly_rate_eur`   | REAL    | Tarif figé à l'ouverture (les changements de tarif ne modifient pas l'historique) |
| `amount_due_eur`    | REAL    | `duration_seconds / 3600 × hourly_rate_eur`               |
| `avg_cpu_percent`   | REAL    | Moyenne des échantillons CPU de la session                |
| `avg_ram_mb`        | REAL    | Moyenne des échantillons RAM de la session                 |
| `avg_gpu_percent`   | REAL    | Moyenne des échantillons GPU (`NULL` si indisponible)       |

**`resource_samples`** — un point CPU/RAM/GPU par sondage, tant qu'une
session est ouverte (sert au calcul des moyennes ci-dessus).

**`settings`** — clé/valeur : `hourlyRateEur`, `containerNameFilter`,
`estimatedWattage`, `electricityPricePerKwh`. Modifiable via l'API sans
redémarrer le service.

## API

| Méthode | Route                | Description                                    |
| ------- | --------------------- | ----------------------------------------------- |
| GET     | `/api/health`          | Vérification de vie                             |
| GET     | `/api/sessions?limit=&offset=` | Historique des sessions, plus récentes d'abord |
| GET     | `/api/sessions/current` | Session en cours, ou `null`                    |
| GET     | `/api/stats/dashboard` | Toutes les statistiques du tableau de bord      |
| GET     | `/api/settings`        | Réglages actuels                                |
| PUT     | `/api/settings`        | Met à jour un ou plusieurs réglages (JSON partiel) |

## Installation

Prérequis : Node.js 22.5+ (utilise le module SQLite intégré à Node, `node:sqlite` —
aucune dépendance native à compiler), Docker Desktop installé et démarré sur Windows 11.

```powershell
cd pc-usage-tracker
npm install
```

## Développement

```powershell
npm run dev
```

Démarre l'API (`http://localhost:4100`) et le tableau de bord
(`http://localhost:4101`) ensemble. Le serveur Vite proxifie `/api` vers
l'API : aucune configuration CORS à faire en développement.

La base SQLite est créée automatiquement au premier démarrage, dans
`server/data/usage.db`.

## Configuration

Copier `server/.env.example` en `server/.env` et ajuster si besoin :

- `HOURLY_RATE_EUR` — tarif horaire par défaut (0,10 € par défaut).
- `CONTAINER_NAME_FILTER` — sous-chaîne identifiant les conteneurs
  IGNITUX (`ignitux` par défaut, cohérent avec le nom de projet Docker
  Compose du dépôt).
- `POLL_INTERVAL_MS` — fréquence de sondage Docker et des ressources.
- `ESTIMATED_WATTAGE` / `ELECTRICITY_PRICE_PER_KWH` — pour l'estimation de
  consommation électrique.

Ces valeurs ne servent qu'à amorcer la base au tout premier démarrage :
ensuite, elles se modifient depuis le tableau de bord (à venir) ou
directement via `PUT /api/settings`, sans redémarrage.

## Tests et qualité

```powershell
npm test    # Jest côté serveur, Vitest côté interface
npm run lint
```

## Construction

```powershell
npm run build
```

Compile l'API (`server/dist`) et l'interface (`web/dist`).

## Déploiement — service Windows (recommandé)

Le service tourne alors directement sur l'hôte, démarre avec Windows, et
accède au moteur Docker nativement (pas de partage de socket nécessaire).

1. Construire l'API : `npm run build -w server` (depuis `pc-usage-tracker/`).
2. Ouvrir une invite **PowerShell en administrateur** (l'inscription d'un
   service Windows l'exige).
3. Installer et démarrer le service :
   ```powershell
   npm run install-windows-service
   ```
4. Vérifier dans `services.msc` que « IGNITUX PC Usage Tracker » est
   présent et démarré. Il redémarrera automatiquement avec Windows.

Pour le désinstaller (toujours en administrateur) :

```powershell
npm run uninstall-windows-service
```

Le tableau de bord (`web/`), lui, n'a pas besoin d'un service : le
construire (`npm run build -w web`) et servir `web/dist` avec l'outil de
son choix (`npx serve web/dist -l 4101`, IIS, etc.), ou le laisser tourner
en développement avec `npm run dev -w web` (le script écoute déjà sur
toutes les interfaces réseau, pas seulement `localhost`).

## Consulter le tableau de bord à distance (Tailscale)

Le PC qui héberge IGNITUX et ce PC-là n'ont pas besoin d'être sur le même
réseau local : avec [Tailscale](https://tailscale.com) installé et connecté
au même compte sur les deux machines, chacune obtient une adresse privée
stable (`100.x.x.x`, ou un nom via MagicDNS) joignable depuis n'importe où,
sans ouvrir aucun port sur la box internet.

1. Installer Tailscale sur le PC serveur : `winget install --id Tailscale.Tailscale -e`,
   puis se connecter avec le même compte que sur les machines qui doivent
   pouvoir le joindre.
2. Sur ce PC serveur, autoriser les ports utilisés dans le Pare-feu Windows
   (invite **PowerShell en administrateur**) :
   ```powershell
   New-NetFirewallRule -DisplayName "IGNITUX (Tailscale)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000,3001,4100,4101
   ```
3. Depuis n'importe quelle machine du même compte Tailscale, remplacer
   `localhost` par l'adresse ou le nom Tailscale du PC serveur — par
   exemple `http://<nom-de-la-machine>.<suffixe-magicdns>.ts.net:4101`
   pour le tableau de bord, `:4100` pour son API, `:3001`/`:3000` pour
   l'application IGNITUX elle-même.

Le frontend Next.js principal grave `NEXT_PUBLIC_API_URL` dans son build :
s'il doit être joint via Tailscale plutôt qu'en local, reconstruire son
image avec cette variable pointée vers l'adresse Tailscale du serveur,
pas vers `localhost` (même piège que documenté pour l'accès depuis un
téléphone sur le réseau local).

## Déploiement — conteneurisé (alternative)

`docker-compose.yml`, à la racine de `pc-usage-tracker/`, construit et
lance l'API et l'interface dans des conteneurs. Sur Docker Desktop pour
Windows (backend WSL2), le socket `/var/run/docker.sock` est exposé aux
conteneurs Linux, donc ce mode fonctionne sans configuration
supplémentaire :

```powershell
docker compose up --build
```

Attention : `VITE_API_URL` (passé en argument de build de `web/`) est
gravé dans le bundle JavaScript **au moment de `vite build`**, pas au
démarrage du conteneur — le changer demande de reconstruire l'image, pas
seulement de la redémarrer (même piège que `NEXT_PUBLIC_API_URL` côté
frontend Next.js du projet principal).

## Dépannage

- **Le service ne détecte aucun conteneur** — vérifier que Docker Desktop
  est démarré, et que `docker ps` liste bien des conteneurs dont le nom
  contient le filtre configuré (`ignitux` par défaut).
- **`node:sqlite` introuvable, ou erreur au démarrage la mentionnant** —
  vérifier la version de Node (`node -v`) : il faut Node 22.5 ou plus
  récent. Sur les toutes premières versions 22.x, ce module était encore
  derrière un drapeau : lancer alors avec
  `NODE_OPTIONS=--experimental-sqlite npm run dev`. Testé et fonctionnel
  sans aucun drapeau à partir de Node 24.
- **GPU affiché « N/D »** — l'utilisation GPU n'est lisible par
  `systeminformation` que sur certaines configurations (typiquement
  NVIDIA avec `nvidia-smi` disponible). C'est un indicateur bonus,
  absent sans lui : ce n'est pas une erreur.
- **L'installation du service échoue silencieusement** — s'assurer que
  la PowerShell est bien ouverte « En tant qu'administrateur » : c'est la
  cause la plus fréquente.
