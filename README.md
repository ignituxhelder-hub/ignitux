# Ignitux

Plateforme pour transformer une idée en réalité : analyser, construire, financer, développer, transmettre.

## Structure

- [`backend/`](backend) — API NestJS + Prisma (Postgres) : comptes, authentification JWT, projets.
- [`frontend/`](frontend) — App Next.js consommant l'API : inscription, connexion, gestion des projets.

## Lancer le projet en local

Deux terminaux, dans cet ordre (le frontend a besoin de l'API pour fonctionner) :

```bash
# 1. Backend — http://localhost:3000
cd backend
npm install
cp .env.example .env   # renseigner DATABASE_URL, générer un JWT_SECRET
npm run start:dev

# 2. Frontend — http://localhost:3001
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Le backend autorise déjà les requêtes CORS depuis `http://localhost:3001` (configurable via `FRONTEND_URL`).

## Fonctionnalités actuelles

- Inscription / connexion (JWT)
- Création, lecture, modification, suppression de projets — chaque projet appartient à un utilisateur

## Vision

Ignitux vise à devenir le cerveau central qui accompagne un projet de l'idée à sa concrétisation :
analyse, construction, financement, développement, transmission — sur le principe *One Brain,
Multiple Regulations* (un socle commun, adapté aux réglementations de chaque pays).
