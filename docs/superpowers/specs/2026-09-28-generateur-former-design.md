# Générateur « Former » — recommandation automatique de forme juridique

28 septembre 2026. Design validé avec Helder en session de brainstorming.

Sous-projet 1 sur 4 du chantier « Ignitux crée l'entreprise » (voir le fil
de brainstorming du 28/09/2026). Les trois autres — génération des
statuts, préparation du dossier de dépôt et démarches annexes (capital,
annonce légale), rattachement du projet à une entreprise immatriculée —
sont des chantiers séparés, non traités ici.

## Pourquoi

Aujourd'hui, une fois qu'Analyser a validé une idée, rien n'aide la
personne à choisir sous quelle forme juridique la porter — un audit du
code a confirmé que `compliance-requirements.ts` ne fait que pointer vers
`formalites.entreprises.gouv.fr` et `insee.fr`, sans jamais recommander
quoi que ce soit de personnalisé. Le besoin : un sixième générateur IGINI,
`former`, qui recommande une forme juridique adaptée au projet réel de la
personne — pas une liste figée, un choix qui tient compte de ce que le
projet décrit (seul ou à plusieurs, ambition de chiffre d'affaires,
patrimoine à protéger).

## Portée v1

- Formes considérées : `micro-entreprise`, `EI`, `EURL`, `SASU`, `SARL`,
  `SAS` — pas de liste plus large (SA, SNC, etc.) tant qu'aucun projet ne
  l'exige.
- Un seul appel par déclenchement : pas d'aller-retour de questions
  bloquant. IGINI part de ce que le projet a déjà dit (titre, description,
  contexte) et, si une information manque pour trancher avec confiance,
  la **suppose explicitement** plutôt que de bloquer — l'hypothèse et la
  façon de la corriger font partie de la sortie (voir schéma plus bas).
- Recommandation = aide à la décision, jamais une décision prise à la
  place de la personne (voir cadrage du prompt).

## Déclenchement : automatique, dès le score franchi

**Décision validée avec Helder** : dès qu'une analyse obtient un score de
faisabilité brut **≥ 8** (le seuil affiché à l'écran, 75/100, correspond à
`feasibility_score * 10 >= 75`, donc à un score brut de 8 ou plus — 7×10 =
70 est en dessous), Former se déclenche automatiquement, sans que la
personne ait besoin de cliquer sur quoi que ce soit.

Point d'insertion : `ProjectsService.analyzeForOwner`, juste après la
persistance de l'analyse — même emplacement que l'appel existant à
`automationService.run(project.id)`, qui applique déjà le même principe
(« sans confirmation ») pour la réévaluation des tâches et des concepts.

**Différence importante avec `automationService.run`** : celui-ci est une
évaluation de règles, rapide, et peut être attendu dans la même requête
sans coût perceptible. Former déclenche un appel Claude complet — 40 à 90
secondes mesurées pour les générateurs existants (PRICING.md §2). Attendre
ce délai dans la réponse de `analyzeForOwner` doublerait le temps
d'attente déjà signalé comme long côté frontend (`AnalyseEnCours`).

**Décision** : l'appel à Former **n'est donc pas attendu** par la réponse
HTTP de `analyzeForOwner`. La personne voit son analyse immédiatement,
comme aujourd'hui ; la recommandation de forme juridique apparaît sur la
page du projet une fois prête (poll ou rechargement — pas de notification
push en v1, YAGNI). C'est un nouveau mode pour ce produit : jusqu'ici,
toute génération IGINI est synchrone du point de vue de la personne (elle
clique, elle attend, elle voit) ; c'est la première génération qui se
termine après que la personne a déjà quitté l'écran qui l'a déclenchée.

**Garde-fous du déclenchement automatique** :
- Si l'offre de la personne n'inclut pas `former` (voir plus bas), on ne
  tente même pas l'appel — pas d'erreur, juste l'invitation à passer à
  l'offre payante affichée sur l'écran de résultat d'analyse.
- Si l'appel échoue (réseau, panne, plafond mensuel atteint), il est
  loggé et n'empêche jamais la réponse de l'analyse de partir. La personne
  garde la possibilité de relancer Former manuellement plus tard (bouton,
  comme les cinq autres générateurs).
- Aucune deuxième tentative automatique : un échec silencieux vaut mieux
  qu'une boucle de relances qui consommerait le plafond de coût sans que
  la personne le sache.

## Offres

**Décision validée avec Helder** : `former` est réservé à l'offre
Entrepreneur (et au-dessus), comme les quatre autres générateurs de la
méthode (Construire, Financer, Développer, Transmettre). Il n'est pas
inclus dans Découverte. `offres-catalogue.ts`, `capacites.generateurs` des
offres payantes (déjà `[...GENERATOR_NAMES]`) l'inclura mécaniquement une
fois `'former'` ajouté à `GENERATOR_NAMES` — aucune autre modification du
catalogue n'est nécessaire.

## Sortie structurée

```
forme_recommandee: 'micro-entreprise' | 'EI' | 'EURL' | 'SASU' | 'SARL' | 'SAS'
raisonnement: string                    // pourquoi cette forme, ancré dans le projet réel
hypotheses: [{ sujet, hypothese_retenue, a_confirmer }]   // vide si le texte du projet suffisait déjà
alternatives_envisagees: [{ forme, pourquoi_pas_choisie }]
points_a_verifier: string[]             // ex. seuils de CA en vigueur si la recherche web n'a rien confirmé de plus récent
```

`sources` s'y ajoute comme pour Analyser (voir plus bas, recherche web) —
jamais demandé au modèle, toujours reconstruit depuis les résultats de
recherche réellement renvoyés (même principe que
`ClaudeService.WebSearchSource`, voir `claude.service.ts`).

## Recherche web

Former active `webSearch` (même mécanisme que celui construit pour
Analyser le 28/09/2026 — `web_search_20260209`, plafonné). Cas d'usage net
: les seuils de chiffre d'affaires de la micro-entreprise et les taux de
cotisations sociales changent chaque année — c'est exactement le genre de
fait daté qu'il vaut mieux vérifier que réciter de mémoire.

## Cadrage du prompt

Comme les cinq autres, `buildSystemPrompt(IGINI_IDENTITY + consigne
propre)`. La consigne propre à Former doit être explicite sur deux points
:
1. La recommandation est une aide à la décision que la personne valide —
   jamais une décision prise à sa place (cohérent avec `IGINI_IDENTITY` :
   « tu ne décides jamais à la place de l'utilisateur »).
2. Dans les cas ambigus (activité réglementée, plusieurs associés aux
   apports très inégaux, patrimoine personnel important à protéger),
   inviter explicitement à vérifier auprès d'un professionnel (comptable,
   avocat) avant de trancher.

Ce cadrage n'est pas cosmétique : c'est ce qui garde Ignitux du bon côté
de la ligne sur l'exercice illégal du droit et de la profession
d'expert-comptable (recherche effectuée le 28/09/2026 : les legaltechs
existantes — Legalstart, Shine, LegalPlace — opèrent sur ce même principe
de conseil non personnalisé-décisif, jamais de cabinet d'avocat déguisé).

## Modèle de données

Même logique que `analyses`/`analysis_sources` : une table parent, des
tables filles pour les listes d'objets composites (pas de colonne Json —
ce schéma n'en a aucune). `points_a_verifier` reste un `String[]` natif,
comme `strengths`/`risks`/`next_steps` sur `analyses`.

```prisma
model legal_form_recommendations {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  project_id        String    @db.Uuid
  project           projects  @relation(fields: [project_id], references: [id], onDelete: Cascade)
  /// 'micro-entreprise' | 'EI' | 'EURL' | 'SASU' | 'SARL' | 'SAS'
  recommended_form  String
  rationale         String
  points_to_check   String[]
  // Provenance — même convention que analyses.generated_by.
  generated_by      String    @default("igini")
  generated_model   String?
  created_at        DateTime? @default(now()) @db.Timestamptz(6)

  assumptions       legal_form_assumptions[]
  alternatives      legal_form_alternatives[]
  sources           legal_form_sources[]

  @@index([project_id])
}

model legal_form_assumptions {
  id                 String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id  String                     @db.Uuid
  recommendation     legal_form_recommendations @relation(fields: [recommendation_id], references: [id], onDelete: Cascade)
  subject            String
  assumption         String
  how_to_correct     String

  @@index([recommendation_id])
}

model legal_form_alternatives {
  id                 String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id  String                     @db.Uuid
  recommendation     legal_form_recommendations @relation(fields: [recommendation_id], references: [id], onDelete: Cascade)
  form               String
  why_not_chosen     String

  @@index([recommendation_id])
}

/// Même rôle que analysis_sources : les pages réellement consultées par
/// la recherche web, jamais des URLs récitées de mémoire.
model legal_form_sources {
  id                 String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id  String                     @db.Uuid
  recommendation     legal_form_recommendations @relation(fields: [recommendation_id], references: [id], onDelete: Cascade)
  title              String
  url                String

  @@index([recommendation_id])
}
```

`projects` gagne la relation `legal_form_recommendations
legal_form_recommendations[]`.

## Backend

- `backend/src/igini/former/former.service.ts` — même patron exact que
  `AnalysisService` : un schéma Zod, un prompt système, un appel à
  `ClaudeService.generateStructuredOutput` avec `webSearch: { maxUses: 5 }`.
- `'former'` ajouté à `GENERATOR_NAMES`
  (`backend/src/igini/usage/generator-names.ts`), entre `'analyser'` et
  `'construire'` — l'ordre du tableau pilote déjà l'ordre d'affichage dans
  `ai-usage.service.ts` (`summarise`), aucun test à modifier au-delà de
  celui qui vérifie la couverture du schéma.
- `ProjectsService.analyzeForOwner` : après la persistance de l'analyse et
  les appels existants (workflow, automation), déclenche Former de façon
  non bloquante si `feasibility_score >= 8` et que l'offre de la personne
  couvre `'former'`.
- `backend/src/users/user-data-scope.ts` : les quatre nouvelles tables
  classées `exported('contenus_generes_par_igini')`, même groupe que
  `analyses` — sinon `user-data-scope.spec.ts` échoue (garde-fou déjà
  vérifié dans cette session).

## Frontend

Nouveau bloc sur la page projet, sur le modèle de `analyse-resultat.tsx` :
affiche la forme recommandée, le raisonnement, les hypothèses (avec un
lien clair « ce n'est pas ton cas ? corrige la description du projet et
relance »), les alternatives envisagées, les sources consultées. Tant que
la recommandation n'est pas encore là (génération en cours en arrière-plan),
un état d'attente discret plutôt qu'un silence qui laisserait croire que
rien ne s'est passé.

## Hors scope v1 (sous-projets suivants)

- Génération des statuts (sous-projet 2).
- Préparation du dossier guichet unique, dépôt de capital, annonce légale
  — et la prise en charge des frais par Ignitux, enregistrée côté
  Financement avec `source: 'ignitux'` (sous-projet 3).
- Rattachement du projet à une entreprise immatriculée, connexion aux
  modules compta/facturation/banque existants (sous-projet 4).
- Statut de mandataire de dépôt auprès de l'INPI (Phase 2 de l'approche
  retenue, après que ce générateur aura prouvé la qualité de ses
  recommandations en conditions réelles).

## Tests

- `former.service.spec.ts` : structure identique à `analysis.service.spec.ts`.
- `projects.service.spec.ts` : nouveaux cas — Former déclenché quand
  `feasibility_score >= 8`, pas déclenché en dessous, pas déclenché si
  l'offre ne couvre pas `'former'`, ne bloque jamais la réponse même si
  Former échoue.
- `ai-pricing.spec.ts` / `ai-usage.service.spec.ts` : aucun changement de
  logique attendu (le modèle appelé reste `claude-opus-5`, déjà tarifé) ;
  vérifier seulement que les tests d'ordre des générateurs restent verts
  avec `'former'` inséré.
