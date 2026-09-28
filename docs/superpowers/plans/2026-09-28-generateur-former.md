# Générateur « Former » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un sixième générateur IGINI, `former`, qui recommande automatiquement une forme juridique adaptée au projet dès qu'une analyse dépasse le score de faisabilité 75/100 (score brut ≥ 8), et qui reste aussi déclenchable à la main.

**Architecture:** Un service `FormerService` sur le patron exact d'`AnalysisService` (schéma Zod, prompt système, `ClaudeService.generateStructuredOutput` avec recherche web). `ProjectsService.analyzeForOwner` déclenche Former sans bloquer sa propre réponse dès que le score le permet ; `ProjectsService` expose aussi un déclenchement manuel et une liste. Quatre nouvelles tables Prisma (une recommandation, trois tables filles) suivent le patron déjà posé par `analyses`/`analysis_sources`.

**Tech Stack:** NestJS, Prisma, Zod, `@anthropic-ai/sdk`, Vitest, Next.js/React côté frontend.

**Spec:** [`docs/superpowers/specs/2026-09-28-generateur-former-design.md`](../specs/2026-09-28-generateur-former-design.md)

## Global Constraints

- Modèle appelé : `claude-opus-5` (`CLAUDE_MODEL`), inchangé.
- Recherche web activée : `webSearch: { maxUses: 5 }`, même mécanisme que pour Analyser.
- `former` est réservé aux offres payantes (Entrepreneur et au-dessus) — pas Découverte.
- Déclenchement automatique : `feasibility_score >= 8` (le seuil affiché 75/100 correspond à `feasibility_score * 10 >= 75`).
- Aucune colonne Json : ce schéma n'en a aucune, les listes d'objets composites vivent dans des tables filles.
- Les sources ne sont jamais demandées au modèle : toujours reconstruites depuis les blocs `web_search_tool_result` réellement renvoyés par l'API (`ClaudeService.WebSearchSource`).
- Recommandation = aide à la décision, jamais une décision prise à la place de la personne (cadrage du prompt).

## Review Focus

- Score exactement à la frontière (7 → pas de déclenchement, 8 → déclenchement) : une erreur d'arrondi ou d'opérateur (`>` au lieu de `>=`) inverserait silencieusement le comportement promis à l'écran.
- Une personne qui relance Analyser plusieurs fois sur un projet déjà au-dessus du seuil ne doit pas déclencher une nouvelle recommandation payante à chaque fois — seule la première franchise du seuil doit lancer Former automatiquement.
- Un collaborateur (pas propriétaire) doit pouvoir consulter les recommandations existantes, jamais en déclencher une nouvelle.
- Une vraie panne (réseau, erreur API) pendant le déclenchement automatique doit être journalisée comme une erreur ; un refus d'entitlement (offre insuffisante, plafond atteint, interrupteur éteint) doit rester silencieux, ce n'est pas une panne.
- Un projet sur l'offre gratuite (Découverte) qui franchit le score ne doit déclencher aucun appel réseau du tout — le refus doit intervenir avant la dépense, pas après.

---

## Task 1 : Schéma Prisma — quatre nouvelles tables

**Files:**
- Modify: `backend/prisma/schema.prisma` (modèle `projects`, et nouveau bloc après le modèle `analysis_sources` ajouté à la session précédente)

**Interfaces:**
- Produces : les modèles Prisma `legal_form_recommendations`, `legal_form_assumptions`, `legal_form_alternatives`, `legal_form_sources`, exploités par toutes les tâches suivantes via `this.prisma.legal_form_recommendations` etc.

- [ ] **Step 1 : Ajouter les quatre modèles au schéma**

Dans `backend/prisma/schema.prisma`, juste après le modèle `analysis_sources` :

```prisma
/// La forme juridique qu'IGINI recommande pour un projet, jamais une
/// décision prise à la place de la personne — voir le cadrage du prompt
/// dans former.service.ts. Une table à part par entreprise, pas une
/// colonne sur `analyses` : le générateur Former est indépendant
/// d'Analyser, même s'il se déclenche souvent juste après.
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

/// Une hypothèse qu'IGINI a prise faute d'information dans le projet —
/// jamais tue : le sujet, l'hypothèse retenue, et comment la corriger si
/// elle est fausse.
model legal_form_assumptions {
  id                 String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id  String                     @db.Uuid
  recommendation     legal_form_recommendations @relation(fields: [recommendation_id], references: [id], onDelete: Cascade)
  subject            String
  assumption         String
  how_to_correct     String

  @@index([recommendation_id])
}

/// Une forme sérieusement envisagée mais pas retenue, et pourquoi.
model legal_form_alternatives {
  id                 String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id  String                     @db.Uuid
  recommendation     legal_form_recommendations @relation(fields: [recommendation_id], references: [id], onDelete: Cascade)
  /// 'micro-entreprise' | 'EI' | 'EURL' | 'SASU' | 'SARL' | 'SAS'
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

- [ ] **Step 2 : Ajouter la relation inverse sur `projects`**

Trouver le modèle `projects` dans `backend/prisma/schema.prisma` (il porte déjà `analyses analyses[]`) et ajouter juste à côté :

```prisma
  legal_form_recommendations legal_form_recommendations[]
```

- [ ] **Step 3 : Pousser le schéma sur la base de développement**

```bash
cd backend && npx prisma db push
```

Attendu : `Your database is now in sync with your Prisma schema.` — **jamais** `npx prisma migrate dev` sur ce projet (voir l'incident du 28/09/2026 : `migrate dev` a voulu réinitialiser toute la base de dev à cause d'un historique de migrations qui n'existe pas ; `db push` est le seul outil utilisé ici).

- [ ] **Step 4 : Régénérer le client Prisma**

```bash
cd backend && npx prisma generate
```

- [ ] **Step 5 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

Attendu : aucune sortie (compilation propre).

- [ ] **Step 6 : Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): tables legal_form_recommendations pour le generateur Former"
```

---

## Task 2 : `GENERATOR_NAMES` — ajouter `'former'`

**Files:**
- Modify: `backend/src/igini/usage/generator-names.ts:21-27`
- Test: `backend/src/igini/usage/ai-usage.service.spec.ts` (le test d'ordre existant doit continuer à passer sans modification)

**Interfaces:**
- Produces : `GeneratorName` inclut désormais `'former'`, consommé par `AiUsageContext`, `offres-catalogue.ts` (`capacites.generateurs`), et toutes les tâches suivantes.

- [ ] **Step 1 : Modifier le tableau**

Dans `backend/src/igini/usage/generator-names.ts`, remplacer :

```typescript
export const GENERATOR_NAMES = [
  'analyser',
  'construire',
  'financer',
  'developper',
  'transmettre',
] as const;
```

par :

```typescript
export const GENERATOR_NAMES = [
  'analyser',
  'former',
  'construire',
  'financer',
  'developper',
  'transmettre',
] as const;
```

- [ ] **Step 2 : Lancer les tests existants qui dépendent de l'ordre**

```bash
cd backend && npx vitest run src/igini/usage/ai-usage.service.spec.ts
```

Attendu : tous les tests passent, y compris « garde l'ordre de la méthode IGINI plutôt que celui des données » — ce test lit `GENERATOR_NAMES` dynamiquement, donc `'former'` y apparaît automatiquement sans modification du test.

- [ ] **Step 3 : Ajouter un test de couverture des offres**

Le fichier `backend/src/offres/offres-catalogue.spec.ts` existe déjà, avec un unique `describe('catalogue des offres', () => { ... })` de haut niveau contenant plusieurs `describe` imbriqués (dont `describe('la ligne de partage', ...)`). Ajouter un nouveau `describe` imbriqué juste après celui-ci, à l'intérieur du `describe` de haut niveau existant (ne pas créer un second `describe` de premier niveau) :

```typescript
  describe('générateur former', () => {
    it("inclut 'former' dans les offres payantes, pas dans Découverte", () => {
      const decouverte = CATALOGUE.find((o) => o.id === 'decouverte')!;
      const entrepreneur = CATALOGUE.find((o) => o.id === 'entrepreneur')!;

      expect(decouverte.capacites.generateurs).not.toContain('former');
      expect(entrepreneur.capacites.generateurs).toContain('former');
    });
  });
```

`CATALOGUE` est déjà importé en tête de ce fichier — aucun nouvel import à ajouter.

- [ ] **Step 4 : Lancer le test**

```bash
cd backend && npx vitest run src/offres/offres-catalogue.spec.ts
```

Attendu : PASS — `entrepreneur.capacites.generateurs` est construit par `[...GENERATOR_NAMES]` dans `offres-catalogue.ts`, donc `'former'` y est inclus mécaniquement sans autre modification.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/igini/usage/generator-names.ts backend/src/offres/offres-catalogue.spec.ts
git commit -m "feat: ajouter 'former' aux generateurs IGINI"
```

---

## Task 3 : `FormerService` — le générateur

**Files:**
- Create: `backend/src/igini/former/former.service.ts`
- Create: `backend/src/igini/former/former.service.spec.ts`
- Create: `backend/src/igini/former/former.module.ts`

**Interfaces:**
- Consumes : `ClaudeService.generateStructuredOutput` (signature établie dans `claude.service.ts` — overload `{ webSearch: WebSearchOptions } → Promise<T & { sources: WebSearchSource[] }>`), `buildProjectPrompt(title, description, context)`, `buildSystemPrompt(stepPrompt)`, `type GenerationAttribution` (`{ userId, projectId }`).
- Produces : `FormerService.recommendLegalForm(title, description, attribution, context?): Promise<LegalFormRecommendationResult>`, `type LegalFormRecommendationResult`, `FormerModule` — consommés par `ProjectsService` (Tâches 6 et 7) et `ProjectsModule` (Tâche 4).

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/igini/former/former.service.spec.ts` :

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service.js';
import { FormerService } from './former.service.js';

const ATTRIBUTION = { userId: 'u1', projectId: 'p1' };

describe('FormerService', () => {
  let service: FormerService;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    claude = { generateStructuredOutput: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FormerService, { provide: ClaudeService, useValue: claude }],
    }).compile();

    service = module.get<FormerService>(FormerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('demande à ClaudeService une recommandation, avec recherche web activée', async () => {
    const recommandation = {
      recommended_form: 'SASU',
      rationale: "Porté seul, avec une ambition de chiffre d'affaires au-delà des plafonds de la micro-entreprise.",
      assumptions: [],
      alternatives: [
        { form: 'EURL', why_not_chosen: 'Régime social moins souple pour lever des fonds plus tard.' },
      ],
      points_to_check: [],
      sources: [],
    };
    claude.generateStructuredOutput.mockResolvedValue(recommandation);

    const result = await service.recommendLegalForm('Mon idée', 'Une description', ATTRIBUTION);

    expect(result).toEqual(recommandation);
    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('Mon idée'),
        // Le générateur est vérifié ici pour la même raison que pour les
        // cinq autres : une étiquette inversée produirait un journal de
        // coûts cohérent et parfaitement faux.
        usage: { userId: 'u1', projectId: 'p1', generator: 'former' },
        webSearch: { maxUses: 5 },
      }),
    );
  });

  it('transmet le contexte (mémoire IGINI, étapes précédentes) quand il est fourni', async () => {
    claude.generateStructuredOutput.mockResolvedValue({
      recommended_form: 'micro-entreprise',
      rationale: 'r',
      assumptions: [],
      alternatives: [],
      points_to_check: [],
      sources: [],
    });

    await service.recommendLegalForm('Titre', 'Description', ATTRIBUTION, 'Contexte : freelance déjà déclaré.');

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.stringContaining('freelance déjà déclaré'),
      }),
    );
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/igini/former/former.service.spec.ts
```

Attendu : FAIL — `Cannot find module './former.service.js'`.

- [ ] **Step 3 : Écrire `former.service.ts`**

Créer `backend/src/igini/former/former.service.ts` :

```typescript
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { buildProjectPrompt } from '../claude/build-project-prompt.js';
import { ClaudeService, type WebSearchSource } from '../claude/claude.service.js';
import type { GenerationAttribution } from '../usage/ai-usage.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';

/**
 * Les six formes couvertes en v1 — pas une liste exhaustive du droit des
 * sociétés françaises, mais celles qu'un porteur de projet croise le plus
 * souvent, seul ou à plusieurs. Voir la spec pour pourquoi ces six-là.
 */
const LEGAL_FORMS = ['micro-entreprise', 'EI', 'EURL', 'SASU', 'SARL', 'SAS'] as const;

const LegalFormRecommendationSchema = z.object({
  recommended_form: z
    .enum(LEGAL_FORMS)
    .describe('La forme juridique la plus adaptée au projet décrit, parmi les six couvertes.'),
  rationale: z
    .string()
    .describe('Pourquoi cette forme, ancré dans ce que le projet décrit réellement — pas une généralité.'),
  assumptions: z
    .array(
      z.object({
        subject: z
          .string()
          .describe("Le sujet sur lequel une information manquait, ex. « nombre d'associés »."),
        assumption: z.string().describe("L'hypothèse retenue en l'absence de cette information."),
        how_to_correct: z.string().describe('Comment corriger si cette hypothèse est fausse.'),
      }),
    )
    .describe('Vide si le texte du projet suffisait déjà à trancher sans hypothèse.'),
  alternatives: z
    .array(
      z.object({
        form: z.enum(LEGAL_FORMS),
        why_not_chosen: z.string(),
      }),
    )
    .describe("1 à 2 formes alternatives sérieusement envisagées, et pourquoi elles n'ont pas été retenues."),
  points_to_check: z
    .array(z.string())
    .describe(
      "Ex. seuils de chiffre d'affaires ou taux de cotisations en vigueur, si la recherche web n'a rien " +
        'confirmé de plus récent que ce que le modèle savait déjà.',
    ),
});

export type LegalFormRecommendationResult = z.infer<typeof LegalFormRecommendationSchema> & {
  sources: WebSearchSource[];
};

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu recommandes une forme juridique adaptée au projet qu'on te
décrit, parmi six formes courantes : micro-entreprise, EI, EURL, SASU, SARL, SAS. Base-toi sur ce que le
projet dit déjà — seul ou à plusieurs, ambition de chiffre d'affaires, patrimoine à protéger, nature de
l'activité. Quand une information te manque pour trancher avec confiance, ne bloque jamais : suppose
explicitement ce qui te semble le plus probable, et dis noir sur blanc quelle hypothèse tu as prise et
comment la corriger si elle est fausse.

Ta recommandation est une aide à la décision que la personne valide elle-même — jamais une décision prise
à sa place. Dans les cas ambigus (activité réglementée, associés aux apports très inégaux, patrimoine
personnel important à protéger), dis explicitement qu'il vaut mieux vérifier auprès d'un comptable ou d'un
avocat avant de trancher.

Tu as accès à une recherche web : utilise-la pour vérifier les seuils et taux en vigueur (plafonds de
chiffre d'affaires de la micro-entreprise, cotisations sociales) plutôt que de réciter ce que tu as appris
à l'entraînement — ces chiffres changent chaque année.`);

/** Recherches autorisées par appel — voir ai-pricing.ts pour ce qu'elles coûtent. */
const WEB_SEARCH_MAX_USES = 5;

@Injectable()
export class FormerService {
  constructor(private readonly claude: ClaudeService) {}

  recommendLegalForm(
    title: string,
    description: string | null,
    attribution: GenerationAttribution,
    context?: string,
  ): Promise<LegalFormRecommendationResult> {
    return this.claude.generateStructuredOutput({
      schema: LegalFormRecommendationSchema,
      system: SYSTEM_PROMPT,
      userContent: buildProjectPrompt(title, description, context),
      logContext: 'Échec de la recommandation de forme juridique via Claude',
      userErrorMessage: 'La recommandation a échoué, réessaie dans un instant.',
      usage: { ...attribution, generator: 'former' },
      webSearch: { maxUses: WEB_SEARCH_MAX_USES },
    });
  }
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
cd backend && npx vitest run src/igini/former/former.service.spec.ts
```

Attendu : PASS (3 tests).

- [ ] **Step 5 : Créer le module**

Créer `backend/src/igini/former/former.module.ts` :

```typescript
import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { FormerService } from './former.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [FormerService],
  exports: [FormerService],
})
export class FormerModule {}
```

- [ ] **Step 6 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 7 : Commit**

```bash
git add backend/src/igini/former/
git commit -m "feat: generateur Former (recommandation de forme juridique)"
```

---

## Task 4 : Classification RGPD des quatre nouvelles tables

**Files:**
- Modify: `backend/src/users/user-data-scope.ts:91-95`

**Interfaces:**
- Consumes : `exported(group: ExportGroup)` (déjà défini dans ce fichier).

- [ ] **Step 1 : Lancer le test qui échoue déjà**

```bash
cd backend && npx vitest run src/users/user-data-scope.spec.ts
```

Attendu : FAIL sur « classe chaque table du schéma, sans exception » — `legal_form_recommendations`, `legal_form_assumptions`, `legal_form_alternatives`, `legal_form_sources` apparaissent dans `unclassified` (le schéma a été modifié en Tâche 1, ce test lit `prisma/schema.prisma` directement).

- [ ] **Step 2 : Classer les quatre tables**

Dans `backend/src/users/user-data-scope.ts`, trouver :

```typescript
  analyses: exported('contenus_generes_par_igini'),
  // Les pages que la recherche web d'IGINI a réellement consultées pour
  // étayer une analyse (voir ClaudeService.WebSearchSource) — même groupe
  // que l'analyse elle-même, dont elles ne sont qu'un détail à part.
  analysis_sources: exported('contenus_generes_par_igini'),
  build_plans: exported('contenus_generes_par_igini'),
```

Remplacer par :

```typescript
  analyses: exported('contenus_generes_par_igini'),
  // Les pages que la recherche web d'IGINI a réellement consultées pour
  // étayer une analyse (voir ClaudeService.WebSearchSource) — même groupe
  // que l'analyse elle-même, dont elles ne sont qu'un détail à part.
  analysis_sources: exported('contenus_generes_par_igini'),
  // Le générateur Former et ses trois tables filles (hypothèses,
  // alternatives, sources) — même groupe que les autres contenus générés
  // par IGINI, même raisonnement que analysis_sources ci-dessus.
  legal_form_recommendations: exported('contenus_generes_par_igini'),
  legal_form_assumptions: exported('contenus_generes_par_igini'),
  legal_form_alternatives: exported('contenus_generes_par_igini'),
  legal_form_sources: exported('contenus_generes_par_igini'),
  build_plans: exported('contenus_generes_par_igini'),
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il passe**

```bash
cd backend && npx vitest run src/users/user-data-scope.spec.ts
```

Attendu : PASS (tous les tests).

- [ ] **Step 4 : Commit**

```bash
git add backend/src/users/user-data-scope.ts
git commit -m "chore(rgpd): classer les tables du generateur Former"
```

---

## Task 5 : `ProjectsModule` — brancher `FormerModule`

**Files:**
- Modify: `backend/src/projects/projects.module.ts:5-26`

**Interfaces:**
- Consumes : `FormerModule` (Tâche 3).

- [ ] **Step 1 : Ajouter l'import**

Dans `backend/src/projects/projects.module.ts`, à côté de :

```typescript
import { AnalysisModule } from '../igini/analysis/analysis.module.js';
```

ajouter :

```typescript
import { FormerModule } from '../igini/former/former.module.js';
```

- [ ] **Step 2 : Ajouter le module à la liste `imports`**

Trouver la liste `imports: [AuthModule, PassportModule.register(...), AnalysisModule, PlanningModule, ...]` et ajouter `FormerModule` juste après `AnalysisModule` :

```typescript
    AnalysisModule,
    FormerModule,
    PlanningModule,
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 4 : Commit**

```bash
git add backend/src/projects/projects.module.ts
git commit -m "chore: brancher FormerModule dans ProjectsModule"
```

---

## Task 6 : `ProjectsService` — déclenchement manuel et liste

**Files:**
- Modify: `backend/src/projects/projects.service.ts` (constructeur, et nouvelle méthode privée + deux méthodes publiques après `listAnalysesForOwner`)
- Modify: `backend/src/projects/projects.service.spec.ts` (mock Prisma + mock `FormerService`)

**Interfaces:**
- Consumes : `FormerService.recommendLegalForm(title, description, attribution, context?)` (Tâche 3), `this.findOneForOwner`, `this.findOneForViewer`, `this.joinContext`, `this.personContext`, `this.memoryContext`, `this.generatedProvenance` (méthodes privées déjà existantes dans `ProjectsService`).
- Produces : `ProjectsService.recommendLegalFormForOwner(ownerId, id)`, `ProjectsService.listLegalFormRecommendationsForOwner(ownerId, id)`, `ProjectsService.persistFormerRecommendation(projectId, ownerId, result)` (privée, réutilisée par la Tâche 7).

- [ ] **Step 1 : Ajouter le mock `FormerService` et les tables Prisma dans le test**

Dans `backend/src/projects/projects.service.spec.ts`, trouver le bloc de types du mock Prisma (`analyses: { create: ReturnType<typeof vi.fn>; ... }`) et ajouter juste après :

```typescript
    legal_form_recommendations: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    legal_form_assumptions: { createMany: ReturnType<typeof vi.fn> };
    legal_form_alternatives: { createMany: ReturnType<typeof vi.fn> };
    legal_form_sources: { createMany: ReturnType<typeof vi.fn> };
```

Puis, dans le bloc `prisma = { ... }` du `beforeEach`, juste après `analyses: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },` :

```typescript
      legal_form_recommendations: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      legal_form_assumptions: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      legal_form_alternatives: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      legal_form_sources: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
```

Puis, trouver la déclaration `let analysisService: { analyzeProject: ReturnType<typeof vi.fn> };` et ajouter juste après :

```typescript
  let formerService: { recommendLegalForm: ReturnType<typeof vi.fn> };
```

Puis, dans le `beforeEach`, à côté de `analysisService = { analyzeProject: vi.fn() };` :

```typescript
    formerService = { recommendLegalForm: vi.fn() };
```

Enfin, dans le tableau `providers` du `Test.createTestingModule`, à côté de `{ provide: AnalysisService, useValue: analysisService },` :

```typescript
        { provide: FormerService, useValue: formerService },
```

Et en haut du fichier, à côté de `import { AnalysisService } from '../igini/analysis/analysis.service.js';` :

```typescript
import { FormerService } from '../igini/former/former.service.js';
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Ajouter, dans `backend/src/projects/projects.service.spec.ts`, un nouveau `describe` après celui de `listAnalysesForOwner` :

```typescript
  describe('recommendLegalFormForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.recommendLegalFormForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(formerService.recommendLegalForm).not.toHaveBeenCalled();
    });

    it('demande une recommandation puis persiste le résultat, sources comprises', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const recommandation = {
        recommended_form: 'SASU',
        rationale: 'Raisonnement',
        assumptions: [{ subject: 'associés', assumption: 'seul', how_to_correct: 'précise si tu es à plusieurs' }],
        alternatives: [{ form: 'EURL', why_not_chosen: 'moins souple pour lever des fonds' }],
        points_to_check: ['vérifier le plafond de CA en vigueur'],
        sources: [{ title: 'Source', url: 'https://exemple.com' }],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      formerService.recommendLegalForm.mockResolvedValue(recommandation);
      // Le mock reflète ce qu'un vrai `create()` Prisma renvoie : les champs
      // passés dans `data`, en écho, plus l'id généré — même convention que
      // `prisma.analyses.create.mockResolvedValue({ id: 'a1', ...analysis })`
      // plus haut dans ce fichier. `assumptions`/`alternatives`/`sources` ne
      // sont volontairement pas dedans : ce sont des tables filles, pas des
      // colonnes de `legal_form_recommendations`.
      prisma.legal_form_recommendations.create.mockResolvedValue({
        id: 'r1',
        project_id: 'p1',
        recommended_form: 'SASU',
        rationale: 'Raisonnement',
        points_to_check: ['vérifier le plafond de CA en vigueur'],
      });

      const result = await service.recommendLegalFormForOwner('u1', 'p1');

      expect(formerService.recommendLegalForm).toHaveBeenCalledWith('Idée', 'Desc', ATTRIBUTION, undefined);
      expect(prisma.legal_form_recommendations.create).toHaveBeenCalledWith({
        data: {
          project_id: 'p1',
          recommended_form: 'SASU',
          rationale: 'Raisonnement',
          points_to_check: ['vérifier le plafond de CA en vigueur'],
          ...GENERATED_PROVENANCE,
        },
      });
      expect(prisma.legal_form_assumptions.createMany).toHaveBeenCalledWith({
        data: [{ recommendation_id: 'r1', subject: 'associés', assumption: 'seul', how_to_correct: 'précise si tu es à plusieurs' }],
      });
      expect(prisma.legal_form_alternatives.createMany).toHaveBeenCalledWith({
        data: [{ recommendation_id: 'r1', form: 'EURL', why_not_chosen: 'moins souple pour lever des fonds' }],
      });
      expect(prisma.legal_form_sources.createMany).toHaveBeenCalledWith({
        data: [{ recommendation_id: 'r1', title: 'Source', url: 'https://exemple.com' }],
      });
      expect(result).toEqual({ id: 'r1', project_id: 'p1', ...recommandation });
    });

    it("n'appelle aucune table fille quand les listes sont vides", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      formerService.recommendLegalForm.mockResolvedValue({
        recommended_form: 'micro-entreprise',
        rationale: 'r',
        assumptions: [],
        alternatives: [],
        points_to_check: [],
        sources: [],
      });
      prisma.legal_form_recommendations.create.mockResolvedValue({ id: 'r1' });

      await service.recommendLegalFormForOwner('u1', 'p1');

      expect(prisma.legal_form_assumptions.createMany).not.toHaveBeenCalled();
      expect(prisma.legal_form_alternatives.createMany).not.toHaveBeenCalled();
      expect(prisma.legal_form_sources.createMany).not.toHaveBeenCalled();
    });
  });

  describe('listLegalFormRecommendationsForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listLegalFormRecommendationsForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('un collaborateur peut lister les recommandations, pas seulement le propriétaire', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.legal_form_recommendations.findMany.mockResolvedValue([{ id: 'r1' }]);

      await expect(
        service.listLegalFormRecommendationsForOwner('u2-collaborateur', 'p1'),
      ).resolves.toEqual([{ id: 'r1' }]);
      expect(prisma.legal_form_recommendations.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        include: { assumptions: true, alternatives: true, sources: true },
        orderBy: { created_at: 'desc' },
      });
    });
  });
```

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend && npx vitest run src/projects/projects.service.spec.ts -t "recommendLegalFormForOwner|listLegalFormRecommendationsForOwner"
```

Attendu : FAIL — les méthodes n'existent pas encore sur `ProjectsService`.

- [ ] **Step 4 : Implémenter dans `ProjectsService`**

Ajouter l'import en haut de `backend/src/projects/projects.service.ts`, à côté de `import { AnalysisService } from '../igini/analysis/analysis.service.js';` :

```typescript
import { FormerService, type LegalFormRecommendationResult } from '../igini/former/former.service.js';
```

Ajouter `private readonly formerService: FormerService,` au constructeur, juste après `private readonly analysisService: AnalysisService,`.

Puis, juste après la méthode `listAnalysesForOwner` (celle qui se termine par `return this.prisma.analyses.findMany({ where: { project_id: id }, include: { sources: true }, orderBy: { created_at: 'desc' } }); }`), ajouter :

```typescript
  /**
   * Persiste une recommandation et ses tables filles. Privée et réutilisée
   * par le déclenchement manuel (ci-dessous) et le déclenchement automatique
   * (ProjectsService.analyzeForOwner) : les deux chemins doivent écrire
   * exactement la même chose.
   */
  private async persistFormerRecommendation(
    projectId: string,
    ownerId: string,
    result: LegalFormRecommendationResult,
  ) {
    const recommendation = await this.prisma.legal_form_recommendations.create({
      data: {
        project_id: projectId,
        recommended_form: result.recommended_form,
        rationale: result.rationale,
        points_to_check: result.points_to_check,
        ...(await this.generatedProvenance('legal_form_recommendations', ownerId, projectId)),
      },
    });

    if (result.assumptions.length > 0) {
      await this.prisma.legal_form_assumptions.createMany({
        data: result.assumptions.map((a) => ({ recommendation_id: recommendation.id, ...a })),
      });
    }
    if (result.alternatives.length > 0) {
      await this.prisma.legal_form_alternatives.createMany({
        data: result.alternatives.map((a) => ({ recommendation_id: recommendation.id, ...a })),
      });
    }
    if (result.sources.length > 0) {
      await this.prisma.legal_form_sources.createMany({
        data: result.sources.map((s) => ({ recommendation_id: recommendation.id, ...s })),
      });
    }

    return {
      ...recommendation,
      assumptions: result.assumptions,
      alternatives: result.alternatives,
      sources: result.sources,
    };
  }

  async recommendLegalFormForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const result = await this.formerService.recommendLegalForm(
      project.title,
      project.description,
      { userId: ownerId, projectId: project.id },
      this.joinContext(await this.personContext(ownerId), await this.memoryContext(ownerId, id)),
    );
    return this.persistFormerRecommendation(project.id, ownerId, result);
  }

  async listLegalFormRecommendationsForOwner(ownerId: string, id: string) {
    await this.findOneForViewer(ownerId, id);
    return this.prisma.legal_form_recommendations.findMany({
      where: { project_id: id },
      include: { assumptions: true, alternatives: true, sources: true },
      orderBy: { created_at: 'desc' },
    });
  }
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd backend && npx vitest run src/projects/projects.service.spec.ts
```

Attendu : PASS (toute la suite — pas seulement les nouveaux tests, pour vérifier l'absence de régression sur les 70+ tests existants).

- [ ] **Step 6 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 7 : Commit**

```bash
git add backend/src/projects/projects.service.ts backend/src/projects/projects.service.spec.ts
git commit -m "feat: declenchement manuel et liste des recommandations Former"
```

---

## Task 7 : `ProjectsService` — déclenchement automatique dans `analyzeForOwner`

**Files:**
- Modify: `backend/src/projects/projects.service.ts` (imports, constructeur — `Logger` — et méthode `analyzeForOwner`)
- Modify: `backend/src/projects/projects.service.spec.ts`

**Interfaces:**
- Consumes : `this.persistFormerRecommendation` (Tâche 6), `formerService.recommendLegalForm` (Tâche 3), `this.prisma.legal_form_recommendations.count`.
- Produces : le comportement automatique décrit dans la spec — aucune nouvelle méthode publique.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `backend/src/projects/projects.service.spec.ts`, dans le `describe('analyzeForOwner', ...)` existant, ajouter :

```typescript
    describe('déclenchement automatique de Former', () => {
      const projetEtAnalyse = (score: number) => {
        const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
        prisma.projects.findFirst.mockResolvedValue(project);
        analysisService.analyzeProject.mockResolvedValue({
          summary: 'r',
          feasibility_score: score,
          strengths: [],
          risks: [],
          next_steps: [],
        });
        prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1', feasibility_score: score });
      };

      it('déclenche Former quand le score atteint 8', async () => {
        projetEtAnalyse(8);
        formerService.recommendLegalForm.mockResolvedValue({
          recommended_form: 'SASU',
          rationale: 'r',
          assumptions: [],
          alternatives: [],
          points_to_check: [],
          sources: [],
        });
        prisma.legal_form_recommendations.create.mockResolvedValue({ id: 'r1' });

        await service.analyzeForOwner('u1', 'p1');
        // Non bloquant : on attend le prochain tick pour laisser la promesse
        // détachée se résoudre avant d'inspecter les mocks.
        await new Promise((resolve) => setImmediate(resolve));

        expect(formerService.recommendLegalForm).toHaveBeenCalledTimes(1);
      });

      it('ne déclenche pas Former en dessous de 8', async () => {
        projetEtAnalyse(7);

        await service.analyzeForOwner('u1', 'p1');
        await new Promise((resolve) => setImmediate(resolve));

        expect(formerService.recommendLegalForm).not.toHaveBeenCalled();
      });

      it("ne déclenche qu'une fois : pas de nouvelle recommandation si le projet en a déjà une", async () => {
        projetEtAnalyse(9);
        prisma.legal_form_recommendations.count.mockResolvedValue(1);

        await service.analyzeForOwner('u1', 'p1');
        await new Promise((resolve) => setImmediate(resolve));

        expect(formerService.recommendLegalForm).not.toHaveBeenCalled();
      });

      it("n'attend pas Former avant de répondre (non bloquant)", async () => {
        projetEtAnalyse(8);
        let resolveFormer: (value: unknown) => void = () => {};
        formerService.recommendLegalForm.mockReturnValue(
          new Promise((resolve) => {
            resolveFormer = resolve;
          }),
        );

        const resultat = await service.analyzeForOwner('u1', 'p1');

        // La réponse de l'analyse part sans attendre Former.
        expect(resultat).toBeTruthy();
        resolveFormer({
          recommended_form: 'SASU',
          rationale: 'r',
          assumptions: [],
          alternatives: [],
          points_to_check: [],
          sources: [],
        });
      });

      it("journalise une vraie panne pendant le déclenchement automatique, sans faire échouer l'analyse", async () => {
        projetEtAnalyse(8);
        formerService.recommendLegalForm.mockRejectedValue(new Error('réseau'));
        // Nest écrit sur le prototype partagé de Logger : l'espionner est le
        // moyen standard de vérifier qu'une erreur a été journalisée, sans
        // exposer le champ privé `logger` de ProjectsService.
        const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        const resultat = await service.analyzeForOwner('u1', 'p1');
        await new Promise((resolve) => setImmediate(resolve));

        expect(resultat).toBeTruthy();
        expect(loggerSpy).toHaveBeenCalled();
        loggerSpy.mockRestore();
      });

      it("reste silencieux quand Former échoue pour un refus d'entitlement (offre insuffisante)", async () => {
        projetEtAnalyse(8);
        formerService.recommendLegalForm.mockRejectedValue(new ForbiddenException('offre insuffisante'));
        const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        await service.analyzeForOwner('u1', 'p1');
        await new Promise((resolve) => setImmediate(resolve));

        expect(loggerSpy).not.toHaveBeenCalled();
        loggerSpy.mockRestore();
      });
    });
```

Ajouter les imports de `ForbiddenException` et `Logger` en haut du fichier de test s'ils n'y sont pas déjà (vérifier l'import existant de `@nestjs/common` et l'étendre) :

```typescript
import { ForbiddenException, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
```

(fusionner avec l'import déjà présent plutôt que d'en créer un second).

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend && npx vitest run src/projects/projects.service.spec.ts -t "déclenchement automatique de Former"
```

Attendu : FAIL — le comportement n'existe pas encore, et `service.logger` n'existe pas.

- [ ] **Step 3 : Ajouter le logger et les imports d'exceptions**

En haut de `backend/src/projects/projects.service.ts`, étendre l'import existant :

```typescript
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
```

Dans la classe, juste avant le constructeur, ajouter :

```typescript
  private readonly logger = new Logger(ProjectsService.name);
```

- [ ] **Step 4 : Implémenter le déclenchement automatique**

Ajouter la méthode privée suivante, juste après `persistFormerRecommendation` (Tâche 6) :

```typescript
  /**
   * Déclenchement automatique de Former — voir
   * docs/superpowers/specs/2026-09-28-generateur-former-design.md.
   *
   * Une seule recommandation automatique par projet : relancer Analyser
   * plusieurs fois sur une idée déjà au-dessus du seuil ne doit pas
   * déclencher une nouvelle dépense à chaque fois. Relancer reste possible
   * à la main (recommendLegalFormForOwner), en connaissance de cause.
   */
  private async triggerFormerAutomatically(ownerId: string, projectId: string): Promise<void> {
    const dejaRecommande = await this.prisma.legal_form_recommendations.count({
      where: { project_id: projectId },
    });
    if (dejaRecommande > 0) return;

    const project = await this.prisma.projects.findUniqueOrThrow({ where: { id: projectId } });

    let result: LegalFormRecommendationResult;
    try {
      result = await this.formerService.recommendLegalForm(
        project.title,
        project.description,
        { userId: ownerId, projectId },
        this.joinContext(await this.personContext(ownerId), await this.memoryContext(ownerId, projectId)),
      );
    } catch (error) {
      // Refus d'entitlement (offre, plafond, interrupteur) : attendu et
      // silencieux, ce ne sont pas des pannes — la personne n'a rien
      // demandé explicitement qui mériterait un message d'erreur.
      const estUnRefusAttendu =
        error instanceof ForbiddenException ||
        error instanceof ServiceUnavailableException ||
        (error instanceof HttpException && error.getStatus() === HttpStatus.PAYMENT_REQUIRED);
      if (estUnRefusAttendu) return;
      throw error;
    }

    await this.persistFormerRecommendation(projectId, ownerId, result);
  }
```

Puis, dans `analyzeForOwner`, juste avant `return { ...analysis, sources };`, ajouter :

```typescript
    // Non attendu par cette réponse : un appel Former prend 40 à 90
    // secondes mesurées (PRICING.md §2), doubler l'attente de l'analyse
    // pour une recommandation que personne n'a explicitement demandée
    // serait pire que la retarder de quelques secondes.
    if (analysis.feasibility_score >= 8) {
      void this.triggerFormerAutomatically(ownerId, project.id).catch((error: unknown) => {
        this.logger.error(
          `Déclenchement automatique de Former en échec pour le projet ${project.id}.`,
          error as Error,
        );
      });
    }
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd backend && npx vitest run src/projects/projects.service.spec.ts
```

Attendu : PASS (toute la suite).

- [ ] **Step 6 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 7 : Commit**

```bash
git add backend/src/projects/projects.service.ts backend/src/projects/projects.service.spec.ts
git commit -m "feat: declenchement automatique de Former des que le score atteint 8"
```

---

## Task 8 : Routes HTTP

**Files:**
- Modify: `backend/src/projects/projects.controller.ts:113-124`
- Modify: `backend/src/projects/projects.controller.spec.ts` (type du mock, `beforeEach`, deux nouveaux tests)

**Interfaces:**
- Consumes : `ProjectsService.recommendLegalFormForOwner`, `ProjectsService.listLegalFormRecommendationsForOwner` (Tâche 6).

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `backend/src/projects/projects.controller.spec.ts`, étendre le bloc de type du mock (juste après `listAnalysesForOwner: ReturnType<typeof vi.fn>;`) :

```typescript
    recommendLegalFormForOwner: ReturnType<typeof vi.fn>;
    listLegalFormRecommendationsForOwner: ReturnType<typeof vi.fn>;
```

Puis, dans le `beforeEach`, juste après `listAnalysesForOwner: vi.fn(),` :

```typescript
      recommendLegalFormForOwner: vi.fn(),
      listLegalFormRecommendationsForOwner: vi.fn(),
```

Puis, juste après le test `listAnalyses délègue au service avec le propriétaire courant` :

```typescript
  it('recommendLegalForm délègue au service avec le propriétaire courant', async () => {
    projectsService.recommendLegalFormForOwner.mockResolvedValue({ id: 'r1' });

    const result = await controller.recommendLegalForm(currentUser, 'p1');

    expect(projectsService.recommendLegalFormForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ id: 'r1' });
  });

  it('listLegalForms délègue au service avec le propriétaire courant', async () => {
    projectsService.listLegalFormRecommendationsForOwner.mockResolvedValue([{ id: 'r1' }]);

    const result = await controller.listLegalForms(currentUser, 'p1');

    expect(projectsService.listLegalFormRecommendationsForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual([{ id: 'r1' }]);
  });
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend && npx vitest run src/projects/projects.controller.spec.ts
```

Attendu : FAIL — `controller.recommendLegalForm` et `controller.listLegalForms` n'existent pas encore.

- [ ] **Step 3 : Ajouter les deux routes**

Dans `backend/src/projects/projects.controller.ts`, juste après le bloc :

```typescript
  @Get(':id/analyses')
  listAnalyses(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listAnalysesForOwner(user.id, id);
  }
```

ajouter :

```typescript
  @Post(':id/legal-form')
  @HttpCode(HttpStatus.CREATED)
  // Chaque appel coûte un appel API Claude — limite dédiée contre les abus.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  recommendLegalForm(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.recommendLegalFormForOwner(user.id, id);
  }

  @Get(':id/legal-forms')
  listLegalForms(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listLegalFormRecommendationsForOwner(user.id, id);
  }
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd backend && npx vitest run src/projects/projects.controller.spec.ts
```

Attendu : PASS (toute la suite du contrôleur).

- [ ] **Step 5 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6 : Commit**

```bash
git add backend/src/projects/projects.controller.ts backend/src/projects/projects.controller.spec.ts
git commit -m "feat: routes HTTP pour la recommandation de forme juridique"
```

---

## Task 9 : Export RGPD (« Mes données »)

**Files:**
- Modify: `backend/src/users/user-data.service.ts` (destructuration, `Promise.all`, objet de retour `contenus_generes_par_igini`)
- Test: `backend/src/users/user-data.service.spec.ts`

**Interfaces:**
- Consumes : `this.prisma.legal_form_recommendations.findMany`.

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `backend/src/users/user-data.service.spec.ts`, dans le `describe("export — droit d'accès", ...)`, ajouter (juste après le test « récupère bien les trois tables du CRM ») :

```typescript
    it('inclut les recommandations de forme juridique dans les contenus générés par IGINI', async () => {
      prisma.legal_form_recommendations.findMany.mockResolvedValue([
        { id: 'r1', recommended_form: 'SASU' },
      ]);

      const exported = await service.exportUserData('u1');

      expect(exported.donnees.contenus_generes_par_igini.formes_juridiques_recommandees).toEqual([
        { id: 'r1', recommended_form: 'SASU' },
      ]);
    });
```

Aucun mock supplémentaire à écrire à la main : `buildPrismaMock()`, en tête de ce fichier, mocke déjà automatiquement **toutes** les tables renvoyées par `exportedTables()` (`user-data-scope.ts`) — `legal_form_recommendations` y apparaîtra dès que la Tâche 4 l'aura classée `exported(...)`.

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/users/user-data.service.spec.ts
```

- [ ] **Step 3 : Implémenter**

Dans `backend/src/users/user-data.service.ts`, trouver la ligne :

```typescript
      this.prisma.analyses.findMany({ where: byProject, include: { sources: true } }),
```

et ajouter juste après :

```typescript
      this.prisma.legal_form_recommendations.findMany({
        where: byProject,
        include: { assumptions: true, alternatives: true, sources: true },
      }),
```

Ajouter la variable correspondante (`legalFormRecommendations`) dans la déstructuration du tableau, juste après `analyses,`.

Puis, dans l'objet de retour, trouver :

```typescript
        contenus_generes_par_igini: {
          analyses,
          plans_de_construction: buildPlans,
```

et remplacer par :

```typescript
        contenus_generes_par_igini: {
          analyses,
          formes_juridiques_recommandees: legalFormRecommendations,
          plans_de_construction: buildPlans,
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
cd backend && npx vitest run src/users/user-data.service.spec.ts
```

- [ ] **Step 5 : Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6 : Commit**

```bash
git add backend/src/users/user-data.service.ts backend/src/users/user-data.service.spec.ts
git commit -m "feat(rgpd): inclure les recommandations de forme juridique dans l'export"
```

---

## Task 10 : Frontend — types et fonctions API

**Files:**
- Modify: `frontend/src/lib/api.ts` (nouvelle interface, deux nouvelles fonctions)

**Interfaces:**
- Produces : `interface LegalFormRecommendation`, `api.recommendLegalForm(token, id)`, `api.listLegalFormRecommendations(token, id)` — consommés par la Tâche 11.

- [ ] **Step 1 : Ajouter l'interface**

Dans `frontend/src/lib/api.ts`, juste après l'interface `Analysis` (et avant `export interface BuildPlan`), ajouter :

```typescript
export interface LegalFormAssumption {
  subject: string;
  assumption: string;
  how_to_correct: string;
}

export interface LegalFormAlternative {
  form: string;
  why_not_chosen: string;
}

export interface LegalFormRecommendation {
  id: string;
  project_id: string;
  /** 'micro-entreprise' | 'EI' | 'EURL' | 'SASU' | 'SARL' | 'SAS' */
  recommended_form: string;
  rationale: string;
  points_to_check: string[];
  assumptions: LegalFormAssumption[];
  alternatives: LegalFormAlternative[];
  sources: AnalysisSource[];
  /** 'igini' | 'human' — voir Charte IGINI, article 12 de la Constitution. */
  generated_by?: string;
  generated_model?: string | null;
  created_at: string;
}
```

(`AnalysisSource` existe déjà dans ce fichier depuis le travail sur la recherche web d'Analyser — même forme `{ title, url }`, réutilisée telle quelle.)

- [ ] **Step 2 : Ajouter les fonctions API**

Dans `frontend/src/lib/api.ts`, juste après le bloc `createFinancingPlan` / `listFinancingPlans` :

```typescript
  recommendLegalForm: (token: string, id: string) =>
    request<LegalFormRecommendation>(`/projects/${id}/legal-form`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  listLegalFormRecommendations: (token: string, id: string) =>
    request<LegalFormRecommendation[]>(`/projects/${id}/legal-forms`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4 : Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: types et fonctions API pour la recommandation de forme juridique"
```

---

## Task 11 : Frontend — affichage sur la page projet

**Files:**
- Create: `frontend/src/app/projects/[id]/forme-juridique-resultat.tsx`
- Modify: `frontend/src/app/projects/[id]/page.tsx` (imports, hooks de données, nouvelle section)
- Modify: `frontend/src/app/projects/[id]/page.spec.tsx:170-189` (le test qui comptait exactement 5 générateurs éteints)

**Interfaces:**
- Consumes : `api.recommendLegalForm`, `api.listLegalFormRecommendations`, `type LegalFormRecommendation` (Tâche 10), `usePlanList`, `useGeneration`, `GenerationSection` (déjà définis dans `page.tsx`).

- [ ] **Step 1 : Créer le composant d'affichage**

Créer `frontend/src/app/projects/[id]/forme-juridique-resultat.tsx` :

```tsx
'use client';

import type { LegalFormRecommendation } from '@/lib/api';

/**
 * LA RECOMMANDATION, AVEC SES HYPOTHÈSES ÉCRITES NOIR SUR BLANC.
 *
 * IGINI ne bloque jamais faute d'information : il suppose, et le dit. Cet
 * écran doit donc montrer les hypothèses aussi clairement que la
 * recommandation elle-même — les cacher reviendrait à transformer une
 * hypothèse déclarée en fait tacite, exactement ce que le générateur a été
 * conçu pour éviter.
 */
export function FormeJuridiqueResultat({ recommandation }: { recommandation: LegalFormRecommendation }) {
  return (
    <div className="project-item" style={{ cursor: 'default' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>Forme recommandée : {recommandation.recommended_form}</strong>
        <span className="muted">{new Date(recommandation.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <p>{recommandation.rationale}</p>

      {recommandation.assumptions.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Ce qu'IGINI a supposé, faute d'information</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.assumptions.map((a, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>
                <strong>{a.subject}</strong> : {a.assumption}
                <br />
                <span className="muted">Pas ton cas ? {a.how_to_correct}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommandation.alternatives.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Alternatives envisagées</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.alternatives.map((alt, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>
                <strong>{alt.form}</strong> : {alt.why_not_chosen}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommandation.points_to_check.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>À vérifier avant de trancher</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.points_to_check.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {recommandation.sources.length > 0 ? (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>Sources consultées</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {recommandation.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          Aucune recherche en ligne n'a été nécessaire pour cette recommandation.
        </p>
      )}

      <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
        IGINI recommande, il ne décide pas — dans les cas ambigus, vérifie auprès d'un comptable ou d'un
        avocat avant de trancher.
      </p>
    </div>
  );
}
```

- [ ] **Step 2 : Brancher la liste et la génération dans `page.tsx`**

Dans `frontend/src/app/projects/[id]/page.tsx`, étendre l'import de `@/lib/api` (ligne ~17-29) pour ajouter `type LegalFormRecommendation` à la liste des types importés.

Ajouter l'import du nouveau composant, à côté de :

```typescript
import { AnalyseEnCours, AnalyseResultat } from './analyse-resultat';
```

```typescript
import { FormeJuridiqueResultat } from './forme-juridique-resultat';
```

Dans le corps de `ProjectDetailPage`, juste après le bloc `const [analyses, setAnalyses] = usePlanList<Analysis>(...); const analysis = useGeneration(...);`, ajouter :

```typescript
  const [legalForms, setLegalForms] = usePlanList<LegalFormRecommendation>(
    token,
    id,
    api.listLegalFormRecommendations,
  );
  const legalForm = useGeneration(
    token,
    id,
    api.recommendLegalForm,
    setLegalForms,
    'Impossible de recommander une forme juridique.',
    onGenerated,
  );
```

Puis, juste après le bloc `{montrer('analyse') && (<GenerationSection ... />)}`, ajouter une nouvelle section (visible dans les mêmes conditions que l'analyse, puisque Former en découle directement) :

```tsx
      {montrer('analyse') && (
        <GenerationSection
          title="Forme juridique"
          buttonLabel="Proposer une forme juridique"
          buttonBusyLabel="Recommandation en cours…"
          emptyLabel="Aucune recommandation pour l'instant — elle apparaît automatiquement dès qu'une analyse dépasse 75/100, ou lance-la toi-même."
          items={legalForms}
          isBusy={legalForm.isBusy}
          error={legalForm.error}
          onGenerate={legalForm.generate}
          renderItem={(item) => <FormeJuridiqueResultat recommandation={item} key={item.id} />}
          readOnly={!isOwner}
          iginiStatus={iginiStatus}
        />
      )}
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4 : Lancer les tests de la page projet**

```bash
cd frontend && npx vitest run "src/app/projects/[id]/page.spec.tsx"
```

Attendu : FAIL sur le test `'remplace les 5 boutons par un message, sans erreur rouge'` (describe `'générateurs IA éteints'`) — il compte exactement 5 sections en état « IA indisponible », et la nouvelle section « Forme juridique » en ajoute une 6e puisqu'elle est visible dans les mêmes conditions que l'Analyse (`montrer('analyse')`).

- [ ] **Step 5 : Corriger le test qui comptait 5 générateurs**

Dans `frontend/src/app/projects/[id]/page.spec.tsx`, remplacer :

```typescript
    it('remplace les 5 boutons par un message, sans erreur rouge', async () => {
```

par :

```typescript
    it('remplace les 6 boutons par un message, sans erreur rouge', async () => {
```

et, un peu plus bas dans le même test, remplacer les deux assertions :

```typescript
      await waitFor(() =>
        expect(screen.getAllByText('Fonctionnalité IA non disponible pour ce test.')).toHaveLength(5),
      );
      expect(screen.queryByText('Analyser ce projet')).not.toBeInTheDocument();
      expect(screen.queryByText('Générer un plan de financement')).not.toBeInTheDocument();
      expect(screen.getAllByText('IA indisponible')).toHaveLength(5);
```

par :

```typescript
      await waitFor(() =>
        expect(screen.getAllByText('Fonctionnalité IA non disponible pour ce test.')).toHaveLength(6),
      );
      expect(screen.queryByText('Analyser ce projet')).not.toBeInTheDocument();
      expect(screen.queryByText('Générer un plan de financement')).not.toBeInTheDocument();
      expect(screen.getAllByText('IA indisponible')).toHaveLength(6);
```

- [ ] **Step 6 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd frontend && npx vitest run "src/app/projects/[id]/page.spec.tsx"
```

Attendu : PASS (toute la suite du fichier).

- [ ] **Step 7 : Commit**

```bash
git add frontend/src/app/projects/[id]/forme-juridique-resultat.tsx frontend/src/app/projects/[id]/page.tsx frontend/src/app/projects/[id]/page.spec.tsx
git commit -m "feat: afficher la recommandation de forme juridique sur la page projet"
```

---

## Vérification finale

- [ ] `cd backend && npx vitest run` — suite complète verte.
- [ ] `cd backend && npx tsc --noEmit` — aucune erreur.
- [ ] `cd frontend && npx vitest run` — suite complète verte.
- [ ] `cd frontend && npx tsc --noEmit` — aucune erreur.
- [ ] Vérification manuelle locale (jamais en ligne) : analyser un projet avec une description suffisamment riche pour scorer ≥ 8, revenir sur la page quelques instants après, et confirmer que la recommandation de forme juridique apparaît sans avoir cliqué sur rien.
