# Architecture

## Stack

- **Backend** — NestJS, Prisma 7 (`@prisma/adapter-pg`) sur PostgreSQL (Supabase). Auth JWT via
  Passport. Validation d'environnement centralisée (Zod, `src/config/env.ts`) exécutée avant le
  démarrage du serveur — un `.env` incomplet ou invalide fait échouer le boot immédiatement, plutôt
  qu'un crash obscur plus tard.
- **Frontend** — Next.js (App Router), React, TypeScript. Pas de librairie de state management :
  `AuthProvider`/`useAuth` (React Context) pour la session, `useState`/`useEffect` partout ailleurs.
  Pas de Tailwind ni de CSS-in-JS : CSS global (`src/app/globals.css`) avec variables CSS pour le
  thème. La direction artistique — « la boussole et le feu » — est décrite en tête de ce fichier,
  avec la règle qui la gouverne : le feu n'habille que ce que la personne déclenche, l'acier tout
  ce que le produit constate.
- **Tests** — Vitest des deux côtés. Voir [`status.md`](status.md) pour le compte à jour : les
  chiffres ne sont pas répétés ici, pour n'avoir qu'un seul endroit à tenir à jour.
  Les tests de bout en bout (`backend/test/*.e2e-spec.ts`) tournent contre une **vraie base**,
  `ignitux_test`, et refusent de démarrer ailleurs.
- **Trois bases** — `postgres` (développement), `ignitux_prod` (vraies personnes),
  `ignitux_test` (bout en bout). Même instance Supabase : données isolées, infrastructure
  partagée. Voir `decisions.md`.
- **CI** — GitHub Actions (`.github/workflows/ci.yml`) : lint + type-check + tests + build, pour
  le backend et le frontend. Le backend est type-vérifié deux fois, avec et sans les tests : la
  config de build les exclut, et une erreur de type dans un mock passait donc inaperçue. Les tests
  de bout en bout n'y sont pas — ils demanderaient d'exposer la base dans les secrets GitHub.

## IGNITUX vs IGINI

IGNITUX est l'écosystème (comptes, projets, communauté) ; IGINI est l'intelligence qui l'anime (les
5 générateurs + les 5 moteurs transverses, dont Automation — le seul à agir sans confirmation
humaine préalable). Cette distinction se reflète dans le code : `backend/src/igini/` contient tout
ce qui est IGINI, le reste de `backend/src/` (auth, projects, community, users, compliance,
marketplace) est IGNITUX.

## Découpage des modules backend

| Domaine | Dossier | Rôle |
|---|---|---|
| Comptes | `src/users/`, `src/auth/` | Inscription, connexion JWT |
| Données personnelles | `src/users/user-data.service.ts` | Export RGPD, aperçu et suppression de compte |
| Comptes — mot de passe/email | `src/auth-tokens/` | Réinitialisation de mot de passe, vérification d'email |
| Email | `src/mail/` | `MailService` — journalise, pas de vrai envoi (voir `decisions.md`) |
| Projets | `src/projects/` | CRUD, visibilité publique/privée, collaborateurs |
| IGINI — 5 générateurs | `src/igini/analysis/`, `planning/`, `financing/`, `development/`, `transmission/` | Un module par étape de la méthode, chacun appelle `ClaudeService` |
| IGINI — moteur Claude partagé | `src/igini/claude/` | Client Anthropic, identité IGINI, traduction des erreurs, et l'**interrupteur** qui coupe les 5 générateurs en amont de tout appel réseau |
| IGINI — mémoire | `src/igini/memory/` | Souvenirs (décisions, préférences…) liés à un utilisateur/projet |
| IGINI — connaissance | `src/igini/knowledge/` | Graphe de concepts (nœuds + relations) |
| IGINI — workflow | `src/igini/workflow/` | Tâches suivables, générées depuis les suggestions IA |
| IGINI — score | `src/igini/scoring/` | Tableau de bord dérivé des données existantes |
| IGINI — automation | `src/igini/automation/` | 5ᵉ moteur : agit sans confirmation humaine (tâches d'étape, liens de concepts), déclenché après chaque génération ou manuellement. N'appelle jamais Claude — voir le commentaire de classe d'`AutomationService` |
| Constitution | `src/constitution/` | Corpus des 24 articles, règles exécutables, journal des violations, audit |
| CRM | `src/crm/` | Entreprises, contacts, échanges — **contient des données de tiers** |
| Facturation | `src/billing/` | Devis, factures, avoirs, règlements. Numérotation sans trou, immuabilité après émission |
| Financement | `src/financing/` | Apports, parts, dividendes versés, conditions de rachat définies par le porteur |
| Communauté | `src/community/` | Projets publics, encouragements |
| Compliance | `src/compliance/` | Liste de référence France (contenu sourcé) + suivi par projet |
| Marketplace | `src/marketplace/` | Annuaire mentors/investisseurs, mise en relation par message (sans argent) |

## Modèle d'accès à un projet

Trois niveaux, tous vérifiés côté backend (jamais seulement côté frontend) :

1. **Propriétaire** (`owner_id`) — accès complet : lire, modifier, supprimer, changer la visibilité,
   générer de nouveaux plans, gérer les collaborateurs. Vérifié par
   `ProjectsService.findOneForOwner`.
2. **Collaborateur** (table `project_collaborators`, invité par email par le propriétaire) — accès
   en lecture seule au projet, à l'historique des 5 générateurs, aux 4 moteurs transverses
   (mémoire/connaissance/workflow/score), à la checklist de conformité et à l'historique
   d'automatisation du projet. Vérifié par
   `ProjectsService.findOneForViewer` (propriétaire OU collaborateur) côté projet, et par
   `assertHasProjectAccess` (propriétaire OU collaborateur) côté moteurs — à ne pas confondre avec
   `assertOwnsProject` (propriétaire uniquement), toujours utilisé pour toutes les écritures
   (créer une tâche, enregistrer un souvenir, créer un concept, changer un statut, gérer les
   collaborateurs).
3. **Communauté** (`is_public = true`) — n'importe quel utilisateur connecté peut consulter le
   projet (champs limités : titre, description, date) et y laisser un encouragement. Un projet privé
   renvoie 404 plutôt que de révéler son existence.

## Mémoire commune entre les étapes IGINI

Chaque étape (sauf Analyser, la première) reçoit un résumé de ce qu'IGINI sait déjà du projet, mais
**uniquement des étapes qui la précèdent dans le pipeline** — jamais des étapes suivantes, même si
elles existent déjà en base (cas d'une régénération d'une étape antérieure après coup). Voir
[`backend/src/igini/README.md`](../backend/src/igini/README.md) pour le détail et l'historique du
bug corrigé sur ce point.

## Le moteur constitutionnel

La Constitution n'est pas qu'un texte affiché : 11 de ses 24 articles sont **appliqués** par
des règles exécutables branchées sur de vrais points d'écriture. Avant d'écrire, un service
soumet son action au moteur (`ConstitutionService.guard`) ; une violation bloquante lève une
422 et l'action n'a pas lieu.

Deux garde-fous empêchent la promesse de se périmer :

- un test échoue si un article déclaré « appliqué » n'est couvert par aucune règle ;
- l'audit (`/constitution/audit`) mesure 9 articles à partir de comptages réels en base, et
  répond `null` — « non mesurable » — plutôt que d'inventer un chiffre pour les autres.

Marquer un article « appliqué » sans dispositif réel serait annoncer une protection inexistante :
c'est pourquoi Offline First (art. 16) et Les Gardiens (art. 17) restent « énoncés ».
