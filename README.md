# Ignitux

[![CI](https://github.com/ignituxhelder-hub/ignitux/actions/workflows/ci.yml/badge.svg)](https://github.com/ignituxhelder-hub/ignitux/actions/workflows/ci.yml)

Plateforme pour transformer une idée en réalité : analyser, construire, financer, développer, transmettre.

## Structure

IGNITUX est l'écosystème, IGINI est l'intelligence qui l'anime — voir [`backend/src/igini/README.md`](backend/src/igini/README.md).

- [`backend/`](backend) — API NestJS + Prisma (Postgres) : comptes, authentification JWT, projets.
  - [`backend/src/igini/`](backend/src/igini) — IGINI, le cerveau : les 5 générateurs IA, le moteur Claude
    partagé, et les 4 moteurs transverses (mémoire, connaissance, workflow, score).
- [`frontend/`](frontend) — App Next.js consommant l'API : inscription, connexion, gestion des projets.

## Lancer le projet en local

Deux terminaux, dans cet ordre (le frontend a besoin de l'API pour fonctionner) :

```bash
# 1. Backend — http://localhost:3000
cd backend
npm install
cp .env.example .env   # renseigner DATABASE_URL, générer un JWT_SECRET, ajouter ANTHROPIC_API_KEY
npm run start:dev

# 2. Frontend — http://localhost:3001
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Le backend autorise déjà les requêtes CORS depuis `http://localhost:3001` (configurable via `FRONTEND_URL`). La configuration est validée au démarrage : un `.env` incomplet ou invalide fait échouer le serveur immédiatement avec un message clair.

## Fonctionnalités actuelles

**Comptes**
- Inscription / connexion (JWT), mots de passe hashés (bcrypt), rate-limiting contre le bruteforce

**Projets**
- Création, lecture, modification, suppression — chaque projet appartient à un utilisateur

**Générateurs IA** (Claude Opus 5), un par étape de la vision — chacun avec son historique persisté :
- **Analyser** — résumé, score de faisabilité, points forts, risques, prochaines étapes
- **Construire** — plan de construction : jalons, délai estimé, ressources clés
- **Financer** — plan de financement : budget estimé, sources, postes de dépense
- **Développer** — plan de croissance : leviers, indicateurs clés, risques de passage à l'échelle
- **Transmettre** — plan de transmission : options de transfert, documentation requise, check-list

**Moteurs transverses d'IGINI** (backend uniquement, sans interface pour l'instant) :
- **Mémoire** — souvenirs (décisions, préférences, apprentissages, faits) liés à un utilisateur/projet
- **Connaissance** — graphe de concepts (nœuds + relations) alimenté manuellement
- **Workflow** — tâches suivables, générées automatiquement à partir des suggestions de l'analyse et
  du plan de construction ; pas de moteur d'automatisation qui les exécute
- **Score** — tableau de bord dérivé des données existantes ; `null` quand aucun signal réel n'existe,
  pas de score de confiance/réputation fabriqué

**Fiabilité**
- `GET /health` vérifie la connexion à la base de données
- Suite de tests (130 tests backend + 21 tests frontend, unitaires et e2e), lint et type-check en CI sur chaque push

## Contact

Ignitux <ignitux@outlook.com>

## Vision

Ignitux vise à devenir le cerveau central qui accompagne un projet de l'idée à sa concrétisation :
analyse, construction, financement, développement, transmission — sur le principe *One Brain,
Multiple Regulations* (un socle commun, adapté aux réglementations de chaque pays).
