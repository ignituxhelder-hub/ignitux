# Ignitux

[![CI](https://github.com/ignituxhelder-hub/ignitux/actions/workflows/ci.yml/badge.svg)](https://github.com/ignituxhelder-hub/ignitux/actions/workflows/ci.yml)

Plateforme pour transformer une idée en réalité : analyser, construire, financer, développer, transmettre.

## Structure

IGNITUX est l'écosystème, IGINI est l'intelligence qui l'anime — voir [`backend/src/igini/README.md`](backend/src/igini/README.md). Documentation complète : [`docs/`](docs/README.md) (architecture, état réel du projet, décisions assumées).

- [`backend/`](backend) — API NestJS + Prisma (Postgres) : comptes, authentification JWT, projets.
  - [`backend/src/igini/`](backend/src/igini) — IGINI, le cerveau : les 5 générateurs IA, le moteur Claude
    partagé, et les 4 moteurs transverses (mémoire, connaissance, workflow, score).
  - [`backend/src/community/`](backend/src/community) — IGNITUX (pas IGINI) : projets publics et
    encouragements entre porteurs de projet.
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
- Collaboration : le propriétaire peut inviter un collaborateur par email, qui peut alors consulter
  le projet et son historique de plans générés (lecture seule — pas encore d'interface frontend)

**Générateurs IA** (Claude Opus 5), un par étape de la vision — chacun avec son historique persisté.
**Sans `ANTHROPIC_API_KEY` configurée, chaque appel échoue avec une erreur 500** (vérifié en conditions
réelles) : le code est complet et testé unitairement, mais la génération ne fonctionne pas de bout en
bout tant que la clé n'est pas renseignée.
- **Analyser** — résumé, score de faisabilité, points forts, risques, prochaines étapes
- **Construire** — plan de construction : jalons, délai estimé, ressources clés
- **Financer** — plan de financement : budget estimé, sources, postes de dépense
- **Développer** — plan de croissance : leviers, indicateurs clés, risques de passage à l'échelle
- **Transmettre** — plan de transmission : options de transfert, documentation requise, check-list

**Moteurs transverses d'IGINI**, avec leur section sur la fiche projet du frontend :
- **Mémoire** — souvenirs (décisions, préférences, apprentissages, faits) liés à un utilisateur/projet
- **Connaissance** — graphe de concepts (nœuds + relations) alimenté manuellement
- **Workflow** — tâches suivables, générées automatiquement à partir des suggestions de l'analyse
  et du plan de construction. Un cinquième moteur, **Automation**, crée et ferme des tâches d'étape
  sans confirmation préalable — mais il n'appelle jamais l'IA et journalise chaque exécution
- **Score** — tableau de bord dérivé des données existantes ; `null` quand aucun signal réel n'existe,
  pas de score de confiance/réputation fabriqué

**Argent**
- **CRM et facturation** — entreprises, contacts, échanges ; devis, factures et avoirs numérotés
  sans trou et figés à l’émission. Ce sont les factures que **tu** envoies à **tes** clients
- **Financement** — apports reçus, répartition des parts, dividendes versés, et les trois
  conditions de rachat que tu définis toi-même
- **Comptabilité et banque** — plan de comptes, journal en partie double, balance, comptes
  bancaires et rapprochement. **L’argent d’Ignitux n’est jamais le tien** : toute écriture a un
  propriétaire et un seul, et un mouvement entre les deux comptabilités s’enregistre des deux
  côtés, jamais dans une écriture à cheval. Une écriture qui toucherait les comptes de l’autre
  est refusée par le moteur constitutionnel, et la tentative est journalisée
- **Aucun virement n’est émis, aucun compte n’est synchronisé avec une banque, et aucun IBAN
  complet n’est conservé** — seulement ses quatre derniers caractères, tant qu’aucun fournisseur
  bancaire n’a été choisi

**Communauté**
- Un projet peut être rendu public par son propriétaire (`/projects/:id/visibility`)
- Les autres utilisateurs découvrent les projets publics (`/community`) et peuvent y laisser des
  encouragements — pas de messagerie privée
- Une **Marketplace** (`/marketplace`) met en relation avec des mentors et des investisseurs :
  profil, annuaire, message d'amorce. **Aucune circulation d'argent**

**Fiabilité**
- `GET /health` vérifie la connexion à la base de données
- Suite de tests unitaires des deux côtés, lint et type-check en CI sur chaque push. Les chiffres
  à jour et la commande pour les vérifier soi-même sont dans [`docs/status.md`](docs/status.md).
- **Tests de bout en bout** (`backend/test/*.e2e-spec.ts`) contre une vraie base Postgres :
  parcours complet, contrôle d'accès avec le jeton de quelqu'un d'autre, garde-fous
  constitutionnels, droits RGPD. Ils tournent sur une base dédiée et **refusent de démarrer
  ailleurs** — ils écrivent puis effacent. Lancement : `npm run test:e2e` depuis `backend/`.
  Pas en CI : cela demanderait d'exposer la base dans les secrets GitHub.
- **Contraste et accessibilité** vérifiés par test : les ratios WCAG sont calculés depuis le CSS,
  et la structure du balisage (un `<h1>` par page, chaque champ étiqueté) est contrôlée à chaque
  exécution. Ce qui demande un vrai navigateur, en revanche, ne l'est pas — voir `ESTIMATION.md`.

## Contact

Ignitux <ignitux@outlook.com>

## Vision

Ignitux vise à devenir le cerveau central qui accompagne un projet de l'idée à sa concrétisation :
analyse, construction, financement, développement, transmission — sur le principe *One Brain,
Multiple Regulations* (un socle commun, adapté aux réglementations de chaque pays).
