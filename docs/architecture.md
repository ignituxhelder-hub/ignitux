# Architecture

## Stack

- **Backend** — NestJS, Prisma 7 (`@prisma/adapter-pg`) sur PostgreSQL (Supabase). Auth JWT via
  Passport. Validation d'environnement centralisée (Zod, `src/config/env.ts`) exécutée avant le
  démarrage du serveur — un `.env` incomplet ou invalide fait échouer le boot immédiatement, plutôt
  qu'un crash obscur plus tard.
- **Frontend** — Next.js (App Router), React, TypeScript. Pas de librairie de state management :
  `AuthProvider`/`useAuth` (React Context) pour la session, `useState`/`useEffect` partout ailleurs.
  Pas de Tailwind ni de CSS-in-JS : CSS global (`src/app/globals.css`) avec variables CSS pour le
  thème (fond sombre, accent orange).
- **Tests** — Vitest des deux côtés. 199 tests backend, 54 tests frontend au 19/09/2026 (voir
  [`status.md`](status.md) pour le compte à jour).
- **CI** — GitHub Actions (`.github/workflows/ci.yml`) : lint + type-check + tests + build sur
  chaque push, pour le backend et le frontend séparément.

## IGNITUX vs IGINI

IGNITUX est l'écosystème (comptes, projets, communauté) ; IGINI est l'intelligence qui l'anime (les
5 générateurs + les 4 moteurs transverses). Cette distinction se reflète dans le code :
`backend/src/igini/` contient tout ce qui est IGINI, le reste de `backend/src/` (auth, projects,
community, users) est IGNITUX.

## Découpage des modules backend (44 routes au total)

| Domaine | Dossier | Rôle |
|---|---|---|
| Comptes | `src/users/`, `src/auth/` | Inscription, connexion JWT |
| Comptes — mot de passe/email | `src/auth-tokens/` | Réinitialisation de mot de passe, vérification d'email |
| Email | `src/mail/` | `MailService` — journalise, pas de vrai envoi (voir `decisions.md`) |
| Projets | `src/projects/` | CRUD, visibilité publique/privée, collaborateurs |
| IGINI — 5 générateurs | `src/igini/analysis/`, `planning/`, `financing/`, `development/`, `transmission/` | Un module par étape de la méthode, chacun appelle `ClaudeService` |
| IGINI — moteur Claude partagé | `src/igini/claude/` | Client Anthropic, identité IGINI, traduction des erreurs |
| IGINI — mémoire | `src/igini/memory/` | Souvenirs (décisions, préférences…) liés à un utilisateur/projet |
| IGINI — connaissance | `src/igini/knowledge/` | Graphe de concepts (nœuds + relations) |
| IGINI — workflow | `src/igini/workflow/` | Tâches suivables, générées depuis les suggestions IA |
| IGINI — score | `src/igini/scoring/` | Tableau de bord dérivé des données existantes |
| Communauté | `src/community/` | Projets publics, encouragements |

## Modèle d'accès à un projet

Trois niveaux, tous vérifiés côté backend (jamais seulement côté frontend) :

1. **Propriétaire** (`owner_id`) — accès complet : lire, modifier, supprimer, changer la visibilité,
   générer de nouveaux plans, gérer les collaborateurs. Vérifié par
   `ProjectsService.findOneForOwner`.
2. **Collaborateur** (table `project_collaborators`, invité par email par le propriétaire) — accès
   en lecture seule au projet et à l'historique des 5 générateurs. Vérifié par
   `ProjectsService.findOneForViewer` (propriétaire OU collaborateur). **Ne couvre pas encore** les
   4 moteurs transverses (mémoire/connaissance/workflow/score), qui restent strictement réservés au
   propriétaire (`assertOwnsProject`) — limitation connue, pas un oubli.
3. **Communauté** (`is_public = true`) — n'importe quel utilisateur connecté peut consulter le
   projet (champs limités : titre, description, date) et y laisser un encouragement. Un projet privé
   renvoie 404 plutôt que de révéler son existence.

## Mémoire commune entre les étapes IGINI

Chaque étape (sauf Analyser, la première) reçoit un résumé de ce qu'IGINI sait déjà du projet, mais
**uniquement des étapes qui la précèdent dans le pipeline** — jamais des étapes suivantes, même si
elles existent déjà en base (cas d'une régénération d'une étape antérieure après coup). Voir
[`backend/src/igini/README.md`](../backend/src/igini/README.md) pour le détail et l'historique du
bug corrigé sur ce point.
