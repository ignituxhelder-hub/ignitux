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
grâce **aux étapes qui la précèdent dans le pipeline** — jamais aux étapes suivantes, même si
elles existent déjà en base (cas d'une régénération d'une étape antérieure). C'est pour ça que
`ProjectsService` n'a pas une seule fonction de contexte universelle, mais une méthode
`latestXContext` par étape, composées explicitement dans chaque `createXPlanForOwner` selon l'ordre
Découvrir → Construire → Financer → Développer → Transmettre :

- Construire ne voit que l'analyse
- Financer voit l'analyse + la construction
- Développer voit l'analyse + la construction + le financement
- Transmettre voit tout ce qui précède

Rien n'empêche aujourd'hui de régénérer une étape après coup ou de générer les étapes dans le
désordre — c'est volontaire (l'utilisateur reste décisionnaire) — mais le contexte transmis reste
toujours borné à ce qui précède logiquement l'étape en cours, jamais à ce qui vient après.

## Ajouter une nouvelle étape

1. Créer `igini/<etape>/` avec un service qui appelle `ClaudeService.generateStructuredOutput`
   (schéma Zod + prompt construit avec `buildSystemPrompt` depuis `igini-identity.ts`).
2. L'exposer dans un module qui importe `ClaudeModule`.
3. Ajouter une méthode `latestXContext` dans `ProjectsService` et l'inclure dans la composition du
   contexte de chaque étape *suivante* (jamais des étapes précédentes).
4. Faire persister le résultat et l'orchestrer depuis `ProjectsService`/`ProjectsController`.
