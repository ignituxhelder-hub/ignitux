# IGINI

Ce dossier est le « cerveau » d'Ignitux : tout ce qui pense, analyse et conseille passe par ici.
IGNITUX est l'écosystème (comptes, projets, API) ; IGINI est l'intelligence qui l'anime.

## Structure

- `claude/` — le moteur partagé : `ClaudeService` (appel à l'API Claude, sortie structurée),
  `igini-identity.ts` (l'identité et la devise d'IGINI, injectée dans chaque prompt) et
  `build-project-prompt.ts` (assemble titre/description + mémoire commune des étapes précédentes).
- `analysis/`, `planning/`, `financing/`, `development/`, `transmission/` — les cinq étapes de la
  méthode, une par module métier. Chacune expose un service unique (ex. `AnalysisService`) que
  `ProjectsService` orchestre.

## Mémoire commune

Chaque étape (sauf la première, l'analyse) reçoit un résumé de ce qu'IGINI sait déjà du projet
grâce aux étapes précédentes (voir `ProjectsService.buildProjectContext`) — IGINI ne repart pas de
zéro à chaque génération.

## Ajouter une nouvelle étape

1. Créer `igini/<etape>/` avec un service qui appelle `ClaudeService.generateStructuredOutput`
   (schéma Zod + prompt préfixé par `IGINI_IDENTITY`).
2. L'exposer dans un module qui importe `ClaudeModule`.
3. Faire persister le résultat et l'orchestrer depuis `ProjectsService`/`ProjectsController`.
