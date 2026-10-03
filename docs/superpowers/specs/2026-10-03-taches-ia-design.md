# IGINI exécute les tâches et la conformité — conception

Date : 2026-10-03 · Branche : `feat/taches-ia` · Statut : à relire par Helder

## Problème

Aujourd'hui « Tâches » et « Conformité » ne sont que des cases à cocher :
l'utilisateur coche, rien ne se fait. Attendu : IGINI **fait** le travail
(rédige, prépare), ou, quand c'est impossible pour une IA (aller s'inscrire
auprès d'une administration), **donne l'ordre exact** des démarches. L'humain
valide ou refuse ; rien n'est coché sans lui.

## Décisions déjà prises avec Helder

- IGINI travaille **seul, en série**, sur les éléments que l'utilisateur choisit.
- Il **s'arrête** à la limite mensuelle d'appels IA ou au plafond de coût.
- L'utilisateur **valide ou refuse** chaque résultat. Jamais de validation automatique.
- Même logique pour **Conformité** (message du 2026-10-03).

## Parcours (identique pour Tâches et Conformité)

1. L'utilisateur coche les éléments voulus, bouton « Faire faire par IGINI ».
2. Aperçu avant lancement : « N éléments, ~N appels IA, il t'en reste M ce mois-ci ».
   Si N > M, IGINI en fera M et l'annoncera.
3. Le frontend envoie **une requête par élément, l'une après l'autre**
   (pas un gros traitement serveur : voir « Limite Render »). Progression visible.
4. Chaque élément passe à l'un de ces états :
   - `a_valider` avec un **livrable** (texte rédigé) ou des **instructions**
     (étapes numérotées, avec lien officiel pour la conformité) ;
   - `echec` (erreur IA, générateurs coupés) — retentable, ne consomme pas de quota ;
   - `non_traite` (arrêt à la limite).
5. Helder lit, puis **Valider** (la tâche passe à faite / la case conformité est
   cochée) ou **Refuser** (retour à « à faire », motif optionnel gardé pour relancer).
6. Arrêt net dès que le quota ou le plafond de coût est atteint ; message clair
   en français, éléments restants intacts.

## Particularité Conformité

Beaucoup de démarches (déclaration, immatriculation) **ne peuvent pas être
exécutées** par une IA. Pour chaque exigence IGINI produit, selon le cas :
un **brouillon prêt à déposer** (texte de déclaration, pièces à joindre) et/ou
la **liste ordonnée des démarches** avec la source officielle déjà stockée
(`source_name`, `source_url`). Il ne prétend jamais avoir déposé quoi que ce soit.
Le libellé du bouton de validation est « J'ai fait / J'ai déposé », pas « terminé par l'IA ».

## Données (migration additive uniquement)

Tâches — colonnes nullables sur `tasks` :
`ai_status` (`a_valider|valide|refuse|echec`), `ai_result_kind` (`livrable|instructions`),
`ai_result` (text), `ai_refusal_reason` (text), `ai_run_at` (timestamptz).
Les lignes existantes restent valides (tout `NULL`).

Conformité — nouvelle table `project_compliance_ai_runs`
(`project_id`, `requirement_id`, `status`, `result_kind`, `result`, `refusal_reason`,
`created_at`, unique `[project_id, requirement_id]`, cascade sur suppression).
Séparée de `project_compliance_checks` : cette dernière signifie « fait » et
une proposition non validée ne doit pas passer pour une conformité atteinte.

Application en production : `migrer-prod.mjs`, lancée par Helder après
vérification (`verifier-base.mjs`) et sauvegarde. Jamais `--accept-data-loss`.

## API

- `POST /projects/:projectId/tasks/:taskId/run`
- `POST /projects/:projectId/compliance/:requirementId/run`
- `POST …/validate` et `POST …/refuse` (body `{ reason? }`) pour chacun.

Règles communes : propriétaire du projet uniquement (collaborateurs en lecture
seule, comme `RefuserEcritureDepassee` existant) ; contrôle de droits via
`droits.ts` avec l'action `generer` + `appelsCeMois` ; plafond de coût via
`ai-quota.ts` ; dépense journalisée dans `ai_usage_events`. Réponse : l'état
final de l'élément. Un élément déjà `a_valider` ou `valide` n'est pas relancé
(idempotent, pas de double facturation).

Générateur : ajouter `'executer'` à `GENERATOR_NAMES`. Il compte dans les
appels IA du mois mais **ne doit pas** être limité par « nombre de générateurs
de l'offre » (sinon Découverte, 1 générateur, serait bloquée). À confirmer en
lisant `offres-catalogue.ts` à l'étape plan ; si cela complique, l'action
reste une action IA ordinaire hors liste des 6 générateurs.

## Appel IA

Sortie structurée (`StructuredOutputRequest<T>`, schéma zod) :
`{ kind: 'livrable'|'instructions', titre, contenu, etapes?: string[] }`.
Contexte envoyé : titre/description du projet, mémoire/analyses utiles déjà
stockées, et l'élément (tâche, ou exigence + source). Le prompt interdit
d'inventer une référence légale absente de la source fournie.

## Limite Render

Le service gratuit coupe les requêtes longues (~100 s, à vérifier) et se
rendort. D'où : une requête par élément, côté navigateur, avec reprise possible
(un élément déjà traité est sauté). Pas de file d'attente ni de tâche de fond pour l'instant.

## Erreurs et cas limites

Générateurs désactivés → `echec`, message explicite. Quota atteint → 402/403
existant traduit en « limite atteinte », le lot s'arrête. Réseau coupé en
cours de lot → éléments restants intacts, relançable. Collaborateur → boutons
masqués et API refuse.

## Tests (TDD)

Backend : service `run` (succès livrable, instructions, échec IA sans quota
consommé, quota atteint, idempotence, non-propriétaire), valider/refuser,
validation → case conformité cochée / tâche faite, migration non destructive.
Frontend : sélection + aperçu, boucle série qui s'arrête à la limite, rendu
livrable vs instructions, valider/refuser, masquage collaborateur.
Avant toute poussée : suite complète + lint + `npm run build`.

## Hors périmètre

Exécution réelle d'actions externes (dépôt administratif, paiement), traitement
en arrière-plan, validation automatique, notifications email (pas de domaine).

## Étapes suivantes

Relecture de ce document par Helder → plan d'implémentation (writing-plans) →
TDD → fusion sur `main` seulement sur son accord.
