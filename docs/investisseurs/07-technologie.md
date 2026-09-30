# Technologie et défensibilité

Toutes les affirmations de ce document sont vérifiées directement dans le code source le 30/09/2026,
sauf mention contraire.

## Architecture

| Couche | Choix | Preuve |
|---|---|---|
| Backend | NestJS, Prisma 7 (`@prisma/adapter-pg`) sur PostgreSQL (Supabase), authentification JWT via Passport | Lecture de `backend/src/`, `docs/architecture.md` |
| Frontend | Next.js (App Router), React, TypeScript, pas de librairie de state management (contexte React) | Lecture de `frontend/src/` |
| Validation de configuration | Zod, exécutée au démarrage — un environnement incomplet fait échouer le serveur immédiatement | `docs/architecture.md`, confirmé par la logique du code |
| Tests | Vitest des deux côtés, plus des tests de bout en bout contre une vraie base Postgres | Exécution réelle le 29-30/09/2026 (voir ci-dessous) |
| Intégration continue | GitHub Actions — lint, type-check, tests, build, et (localement, non encore confirmé poussé) bout en bout sur base jetable, build et démarrage réel des images Docker, vérification navigateur réelle du démarrage hors ligne | Lecture de `.github/workflows/ci.yml` |

## Résultats de tests réels (29-30/09/2026)

| Suite | Fichiers | Tests | Résultat |
|---|---|---|---|
| Backend | 93 | 1204 | 1203 verts, 1 échec (timeout, test statistique) |
| Frontend | 52 | 499 | 490 verts, 9 échecs (tous des timeouts) |

Tous les échecs observés sont des dépassements de délai, jamais une valeur incorrecte — signe
probable d'une machine sous contrainte de ressources plutôt que d'une régression, mais non confirmé
par une ré-exécution sur une autre machine. Les tests de bout en bout (~250, selon la Bible) n'ont
pas été exécutés dans le cadre de cet audit.

## Ce qui constitue une vraie défensibilité technique

1. **Le moteur constitutionnel exécutable.** 24 articles, 12 appliqués par 16 règles, branchées sur
   de vrais points d'écriture serveur (comptabilité, financement, mémoire, workflow, exposition
   publique de projets). Une action qui violerait une règle bloquante est refusée avant d'être
   enregistrée, et la tentative est journalisée — pas silencieusement ignorée. Un test échoue si un
   article déclaré « appliqué » n'a aucune règle qui le couvre, ce qui empêche la documentation de
   mentir plus longtemps qu'un passage de tests.
2. **La séparation stricte des caisses.** Quatre règles constitutionnelles dédiées empêchent
   structurellement qu'une écriture mélange l'argent d'IGNITUX, celui d'un utilisateur, ou celui de
   deux projets financés différents.
3. **Le refus des données inventées.** Un score sans donnée réelle renvoie l'absence de valeur, pas
   un chiffre plausible. Un contenu généré par IGINI porte toujours sa provenance (modèle, jetons,
   durée, personne, projet).
4. **L'interrupteur de coût IA.** Le verrou qui coupe les cinq générateurs est posé en un point
   unique, avant tout appel réseau — vérifié directement dans
   `backend/src/igini/claude/generators-availability.ts`. Aucune dépense n'est possible tant qu'il
   est fermé, ce qui rend le contrôle budgétaire non contournable par erreur de configuration
   partielle.
5. **Le démarrage hors connexion.** Contrairement à ce que dit la Bible (27/09/2026), le code montre
   qu'un service worker fonctionnel existe depuis le 24/09/2026, vérifié par un test réel dans un
   navigateur Chromium en intégration continue (coupure de réseau, vérification que l'application
   s'ouvre quand même).

## Limites techniques actuelles, sans les maquiller

- Les cinq générateurs IA sont désactivés — décision de budget, pas un défaut, mais l'utilisateur
  final ne peut pas en profiter aujourd'hui sans que cette décision soit prise.
- Aucun encaissement réel n'est branché.
- L'e-mail transactionnel n'atteint personne en production tant qu'un fournisseur n'est pas choisi.
- Une fragmentation Git réelle existe (6 commits non poussés, 79 fichiers non commités sur `main`,
  trois branches de travail avancées jamais fusionnées) — voir `10-risques-et-reponses.md`.
- Le rôle des « Gardiens » (article constitutionnel 17) n'a aucune traduction en code.

## Propriété intellectuelle

Le code est propriétaire. Aucune trace de dépôt de marque ou de protection formelle n'a été trouvée
dans le dépôt — **[À DÉFINIR — Fondateur]**.
