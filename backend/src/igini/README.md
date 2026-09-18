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
- `memory/`, `knowledge/`, `workflow/`, `scoring/` — les quatre moteurs transverses d'IGINI (voir
  ci-dessous). Contrairement aux cinq étapes, ce ne sont pas des générateurs IA : ce sont des
  briques de données et de logique déterministe qui soutiennent la méthode sans appeler Claude.

## Les quatre moteurs

Ces moteurs répondent à un besoin identifié : IGINI ne doit pas se limiter à cinq boutons de
génération isolés, il doit garder trace de ce qui a été décidé, relier les idées entre elles,
transformer les suggestions en actions suivables, et donner une vision d'ensemble honnête de
l'avancement. Chacun est volontairement simple et **sans fabrication de données** — s'il n'y a pas
de signal réel, le moteur renvoie `null` ou une valeur neutre plutôt qu'un chiffre inventé.

- **Mémoire** (`memory/`) — `POST /memory`, `GET /memory`, `GET /memory/summary`,
  `POST /memory/:id/link`. Stocke des souvenirs (`decision`, `preference`, `learning`, `fact`)
  liés à un utilisateur et éventuellement à un projet ; `search` fait une recherche texte simple
  (`contains`, insensible à la casse) ; `summarize` agrège du texte de façon déterministe — **il
  n'appelle pas Claude**, ce n'est pas un résumé généré par IA mais une concaténation lisible.
- **Connaissance** (`knowledge/`) — `POST /knowledge/concepts`, `GET /knowledge/concepts`,
  `POST /knowledge/concepts/:id/links`, `GET /knowledge/graph`. Un graphe de concepts simple
  (nœuds + arêtes typées par `relation_type`) que l'utilisateur alimente lui-même ; il n'y a pas
  encore d'extraction automatique de concepts depuis les plans générés.
- **Workflow** (`workflow/`) — `POST /projects/:projectId/tasks`, `GET /projects/:projectId/tasks`,
  `PATCH /tasks/:taskId/status`. Des tâches suivables (`pending`/`done`/…, assignées à `human` ou
  `igini`) créées manuellement ou automatiquement : `ProjectsService.analyzeForOwner` et
  `createBuildPlanForOwner` appellent `WorkflowService.createTasksFromSuggestions` pour transformer
  les prochaines étapes/jalons suggérés par l'IA en tâches réelles. **Il n'y a pas de moteur
  d'automatisation qui exécute ces tâches tout seul** — IGINI n'a aucune action concrète à
  déclencher pour l'instant, ce serait mentir que de le prétendre.
- **Score** (`scoring/`) — `GET /projects/:projectId/scores`. Un tableau de bord dérivé des
  données déjà en base : `etincelle` = score de faisabilité de la dernière analyse (ou `null` si
  aucune analyse), `construction` = proportion de tâches terminées, `evolution`/`transmission` =
  heuristiques bornées à 10 basées sur la richesse du plan de développement/transmission, et
  `confiance` = proportion des 5 étapes déjà entamées. **Ce ne sont pas des scores de confiance ou
  de réputation réels** (pas de données de tiers, pas de vérification externe) — seulement des
  proxys honnêtes calculés à partir de ce qu'IGINI sait déjà.

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
