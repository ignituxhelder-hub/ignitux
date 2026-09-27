# IGINI conversationnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the chat-with-Igini icon into a tool-using orchestrator: one global conversation thread per user that can answer freely, list the person's projects, recall memories, and trigger any of the 5 existing generators (Analyser/Construire/Financer/Développer/Transmettre) on a specific project — all through the exact same guarded code paths the current buttons already use.

**Architecture:** A new `ClaudeService.converseWithTools()` runs a 3-turn-max loop over the Anthropic SDK's native tool-use (`messages.create({ tools })`), using a cheap/fast orchestration model distinct from the generators' `claude-opus-5`. Each tool is a thin bridge (`IginiToolsService`) to an already-existing, already-guarded NestJS service method — no new authorization logic, no new Constitution rule, no new persisted detail beyond the final user/Igini message pair. The floating icon, panel, `chat_messages` table, and `POST/GET /chat/messages` endpoints are unchanged from the plain-text chat design that this plan supersedes.

**Tech Stack:** NestJS + Prisma (backend), Next.js/React (frontend), Vitest (`vi.fn`/`vi.mock`, not Jest) on both sides, `@anthropic-ai/sdk` (native tool-use, first use in this codebase), `zod` (tool-input validation).

**Spec:** `docs/superpowers/specs/2026-09-27-igini-conversationnel-design.md` (supersedes `docs/superpowers/specs/2026-09-27-chat-igini-design.md`, which it explicitly says to keep unchanged: the `chat_messages` table, the endpoints, and the frontend placement).

## Global Constraints

- **Fusion, not coexistence**: ship the tool-orchestrator directly; there is no separate plain-text-only chat to build first.
- **Tool scope is exactly 7**: `lister_projets`, `rappeler_souvenirs`, and the 5 generators. No CRM/billing/accounting/banking tools in this v1.
- **Chat is global** — one thread per user, never scoped to a project. Igini must resolve "my bakery project" to a `project_id` itself, via `lister_projets`, before calling a generator tool.
- **`droits.ts` stays binary and unchanged.** There is no "autonomy levels" concept anywhere in the code. The only guard against calling a paid generator unprompted is a system-prompt instruction, not a code lock.
- **Each generator tool calls the exact existing `ProjectsService` method the button already calls** (`analyzeForOwner`, `createBuildPlanForOwner`, `createFinancingPlanForOwner`, `createDevelopmentPlanForOwner`, `createTransmissionPlanForOwner`) — same `offres.exiger()`, same `assertWithinQuota()`, same `ai_usage_events` logging under the generator's own existing name. The orchestrator adds no new guard of its own for these.
- **A tool's refusal becomes a conversational answer**: any exception from a tool call (quota exhausted, offer insufficient, project not found, AI switched off) is caught and returned as an error `tool_result` string — never left to crash the turn or bubble as a raw 500.
- **Memory stays read-only from the model's side.** `rappeler_souvenirs` is the only memory tool; there is no memory-write tool. A suggestion to save something is surfaced as a text marker the frontend turns into a button that calls the *existing* `POST /memory` endpoint — zero new route, zero new field on `memories`.
- **`chat_messages` gains no column.** Only the person's message and Igini's final text reply are persisted — the intermediate tool-use turns are never written to the database.
- **`GenerationAttribution.projectId` is `string | null`** (chat's own conversational turns carry `null`; each generator tool still supplies a real `project_id` to the service it calls).
- **Two models**: a new `CLAUDE_ORCHESTRATOR_MODEL` constant for conversation turns; the existing `CLAUDE_MODEL` (`claude-opus-5`) keeps serving the 5 generators, completely unchanged.
- **Orchestration is capped at 3 Claude calls.** Reaching the cap without a final text reply returns an explicit French failure message, never a silently truncated answer — and, load-bearing for trust: a tool is **never executed on the last permitted turn**, so a paid/side-effecting generator can never run without a following call available to tell the person what happened.
- **No new Constitution article or rule.** The confirmation guarantee lives in the system prompt, not the constitutional engine (per the spec's own reasoning: there is always a human message that triggers the tool, so article 8 doesn't apply).
- Chat still never appears logged out, never on `/login`/`/signup`/the public landing page, never accepts anonymous access, still has no streaming, and still never calls `OffresService.exiger()` for the conversational turn itself (only the tools it invokes do, via the existing code they call).

## Review Focus

- **A generator tool call lands on the orchestrator's last permitted turn.** A reasonable person expects Igini to never silently run (and pay for, and persist) an analysis it can't tell them about — the loop must refuse to execute the tool and return the explicit failure message instead. Covered in Task 7.
- **A tool call throws (quota exhausted, offer insufficient, project not owned, AI switched off).** The turn must keep going with a clean `tool_result` error, never an unhandled exception that crashes the whole chat request. Covered in Task 5.
- **The model sends malformed or missing tool input** (e.g. calls `analyser` with no `project_id`, since `ToolUseBlock.input` is `unknown`). Must produce a tool-result error, never throw past the executor. Covered in Task 5.
- **Two consecutive `user`-role messages in the seed history** (a previous turn's reply never got persisted because the request failed after the user's message was saved). The Claude API requires strict alternation; the seed builder must merge them. Covered in Task 6.
- **The `[[souvenir: …]]` / `[[projet: …]]` markers leak into the visible bubble text.** A reasonable person reading the chat should never see raw internal-looking tags; they must always be stripped before display, whether or not a marker is present, with or without trailing whitespace. Covered in Task 11.

---

## Task 1: Prisma schema — `chat_messages` table

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `chat_messages { id, user_id, role, content, created_at }`, relation `users.chat_messages`. Consumed by Task 8 (`ChatService`) via `PrismaService`.

This task has no application logic to unit-test — it's schema + a database push, verified by successfully generating the Prisma Client that Task 8's tests type-check against.

- [ ] **Step 1: Add the `chat_messages` model to the schema**

In `backend/prisma/schema.prisma`, insert this new model directly after the `memories` model (right before the `concepts` model's doc comment):

```prisma
/// This model contains row level security and requires additional setup for migrations. Visit https://pris.ly/d/row-level-security for more info.
/// CHAT — un message échangé librement avec Igini, en dehors des 5
/// générateurs structurés. Un seul fil continu par utilisateur : le rôle
/// (`role`) porte la distinction entre ce que la personne a écrit et ce
/// qu'Igini a répondu. Ne stocke jamais le détail des appels d'outils
/// (analyser/construire/...) qu'un tour de conversation a pu déclencher —
/// seule la réponse finale en langage naturel est conservée ici.
model chat_messages {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String    @db.Uuid
  user       users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  /// 'user' | 'igini'
  role       String
  content    String
  created_at DateTime? @default(now()) @db.Timestamptz(6)

  @@index([user_id, created_at])
}
```

- [ ] **Step 2: Add the reverse relation on `users`**

In the same file, in the `users` model, add a line next to the existing `memories memories[]` relation field:

```prisma
  memories                  memories[]
  chat_messages             chat_messages[]
```

- [ ] **Step 3: Format the schema**

Run: `cd backend && npx prisma format`

- [ ] **Step 4: Push the schema to the dev database and regenerate the client**

Run: `cd backend && npx prisma db push`

Expected: reports the new `chat_messages` table created, and regenerates `backend/src/generated/prisma/*` — confirm `git status` shows changes there.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/generated/prisma
git commit -m "feat(chat): ajouter la table chat_messages"
```

---

## Task 2: Shared usage/availability prep — `discuter` generator + nullable `projectId`

**Files:**
- Modify: `backend/src/igini/usage/generator-names.ts`
- Create: `backend/src/igini/usage/generator-names.spec.ts`
- Modify: `backend/src/igini/usage/ai-usage.service.ts` (the `GenerationAttribution` interface)
- Modify: `backend/src/igini/usage/ai-usage.service.spec.ts`
- Modify: `backend/src/igini/claude/generators-availability.ts`
- Modify: `backend/src/igini/claude/generators-availability.spec.ts`

**Interfaces:**
- Produces: `GENERATOR_NAMES` includes `'discuter'`; `GeneratorName` union includes `'discuter'`; `GenerationAttribution.projectId: string | null`; `GENERATORS_DISABLED_MESSAGE` mentions the chat.
- Consumed by: Task 7 (`ClaudeService.converseWithTools`) and Task 8 (`ChatService`).

- [ ] **Step 1: Write the failing test for the new generator name**

Create `backend/src/igini/usage/generator-names.spec.ts`:

```ts
import { estGenerateur, GENERATOR_NAMES } from './generator-names.js';

describe('generator-names', () => {
  it('reconnaît discuter comme un générateur valide (le chat libre avec Igini)', () => {
    expect(estGenerateur('discuter')).toBe(true);
    expect(GENERATOR_NAMES).toContain('discuter');
  });

  it('rejette une chaîne qui ne correspond à aucun générateur', () => {
    expect(estGenerateur('inventer')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/usage/generator-names.spec.ts`
Expected: FAIL — `estGenerateur('discuter')` is `false`.

- [ ] **Step 3: Add `'discuter'` to `GENERATOR_NAMES`**

In `backend/src/igini/usage/generator-names.ts`, change the title comment and the array:

```ts
/**
 * LES GÉNÉRATEURS D'IGINI, ET LE CHAT, NOMMÉS UNE SEULE FOIS.
 *
 * Fichier à part, et sans aucune dépendance : le journal de consommation,
 * le catalogue des offres et les contrôles de droits ont tous besoin de ces
 * noms, et deux d'entre eux doivent rester purs — sans Nest, sans base.
 *
 * ## Pourquoi pas deux listes
 *
 * Il y en a eu deux pendant un moment : `analyser/construire/financer/...`
 * côté journal, `analyse/construction/financement/...` côté offres. Rien
 * n'échouait — c'est le problème. Un quota se serait appliqué à un nom que
 * personne n'émettait, et le refus ne serait jamais venu. Le commentaire
 * qui interdisait déjà d'écrire « Analyser » avec une majuscule disait la
 * même chose, en plus petit.
 *
 * Ces chaînes sont écrites en base (`ai_usage_events.generator`). Les
 * renommer demande une migration des lignes existantes, pas seulement un
 * remplacement dans les sources.
 *
 * `discuter` (les tours de conversation de l'orchestrateur IGINI) est ici
 * pour la même raison de traçabilité des coûts que les 5 générateurs, mais
 * suit une règle différente : aucun appel ne passe par
 * `OffresService.exiger()` pour lui (voir `ClaudeService.converseWithTools`)
 * — seul le plafond de coût global le protège. Un tour de conversation qui
 * déclenche un générateur (ex. `analyser`) journalise CE générateur sous
 * son propre nom existant, via le code déjà en place ; `discuter` ne
 * journalise jamais que les tours de l'orchestrateur lui-même.
 */
export const GENERATOR_NAMES = [
  'analyser',
  'construire',
  'financer',
  'developper',
  'transmettre',
  'discuter',
] as const;

export type GeneratorName = (typeof GENERATOR_NAMES)[number];

export function estGenerateur(valeur: string): valeur is GeneratorName {
  return (GENERATOR_NAMES as readonly string[]).includes(valeur);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/usage/generator-names.spec.ts`
Expected: PASS

- [ ] **Step 5: Also verify the existing offers catalogue suite still passes**

Run: `cd backend && npx vitest run src/offres/offres-catalogue.spec.ts`
Expected: PASS unchanged — `offre('entrepreneur').capacites.generateurs` and `offre('construction').capacites.generateurs` are built as `[...GENERATOR_NAMES]`, so they'll now include `'discuter'` too, but the test compares against the same constant, so it stays in sync automatically. This has no runtime effect: the orchestrator's conversational turn never calls `OffresService.exiger()`, so this list is never consulted for it.

- [ ] **Step 6: Write the failing test for a nullable `projectId`**

In `backend/src/igini/usage/ai-usage.service.spec.ts`, inside the `describe('enregistrement', ...)` block, add:

```ts
    it('accepte et journalise un projectId null (appel non rattaché à un projet, ex. le chat)', async () => {
      await service.record({
        context: { userId: 'u1', projectId: null, generator: 'discuter' },
        model: 'claude-opus-5',
        usage: UTILISATION,
        durationMs: 10,
      });

      expect(table.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ project_id: null }) }),
      );
    });
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/usage/ai-usage.service.spec.ts`
Expected: FAIL — TypeScript error, `projectId: null` is not assignable to `GenerationAttribution.projectId: string`.

- [ ] **Step 8: Widen `GenerationAttribution.projectId`**

In `backend/src/igini/usage/ai-usage.service.ts`, change:

```ts
export interface GenerationAttribution {
  userId: string;
  projectId: string;
}
```

to:

```ts
export interface GenerationAttribution {
  userId: string;
  /**
   * `null` pour un appel non rattaché à un projet — un tour de conversation
   * de l'orchestrateur (voir `ClaudeService.converseWithTools`). Les 5
   * générateurs, appelés directement ou via un outil du chat, continuent de
   * passer une chaîne non nulle ; la colonne `ai_usage_events.project_id`
   * est déjà nullable en base, seul ce type l'était encore.
   */
  projectId: string | null;
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/usage/ai-usage.service.spec.ts`
Expected: PASS, and no other test in this file regresses (all existing callers pass a non-null string, which still satisfies `string | null`).

- [ ] **Step 10: Write the failing test for the updated disabled-message wording**

In `backend/src/igini/claude/generators-availability.spec.ts`, add:

```ts
  it('mentionne aussi le chat avec Igini, devenu la 6e chose protégée par cet interrupteur', () => {
    expect(GENERATORS_DISABLED_MESSAGE.toLowerCase()).toContain('chat');
  });
```

- [ ] **Step 11: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/claude/generators-availability.spec.ts`
Expected: FAIL — current message doesn't mention "chat".

- [ ] **Step 12: Update `GENERATORS_DISABLED_MESSAGE` and its doc comment**

In `backend/src/igini/claude/generators-availability.ts`, change:

```ts
 * Les générateurs (Analyser, Construire, Financer, Développer, Transmettre)
 * sont les seules fonctionnalités d'Ignitux qui consomment du budget IA.
 * Ce module porte l'interrupteur qui les coupe, et rien d'autre.
```

to:

```ts
 * Les générateurs (Analyser, Construire, Financer, Développer, Transmettre)
 * et le chat libre avec Igini sont les seules fonctionnalités d'Ignitux qui
 * consomment du budget IA. Ce module porte l'interrupteur qui les coupe,
 * et rien d'autre.
```

and change:

```ts
export const GENERATORS_DISABLED_MESSAGE =
  "Fonctionnalité IA non disponible pour ce test. Les 5 générateurs d'IGINI (Analyser, " +
  'Construire, Financer, Développer, Transmettre) sont volontairement éteints sur cet ' +
  "environnement : aucune demande n'est envoyée à l'IA. Tout le reste d'Ignitux fonctionne " +
  'normalement.';
```

to:

```ts
export const GENERATORS_DISABLED_MESSAGE =
  "Fonctionnalité IA non disponible pour ce test. Les 5 générateurs d'IGINI (Analyser, " +
  'Construire, Financer, Développer, Transmettre) et le chat libre avec Igini sont ' +
  "volontairement éteints sur cet environnement : aucune demande n'est envoyée à l'IA. " +
  "Tout le reste d'Ignitux fonctionne normalement.";
```

- [ ] **Step 13: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/claude/generators-availability.spec.ts`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add backend/src/igini/usage/generator-names.ts backend/src/igini/usage/generator-names.spec.ts backend/src/igini/usage/ai-usage.service.ts backend/src/igini/usage/ai-usage.service.spec.ts backend/src/igini/claude/generators-availability.ts backend/src/igini/claude/generators-availability.spec.ts
git commit -m "feat(chat): preparer generator-names et ai-usage pour l'orchestrateur (discuter, projectId nullable)"
```

---

## Task 3: Export `ProjectsService` from `ProjectsModule`

**Files:**
- Modify: `backend/src/projects/projects.module.ts`
- Create: `backend/src/projects/projects.module.spec.ts`

**Interfaces:**
- Produces: `ProjectsModule` exports `ProjectsService`. Consumed by Task 9 (`ChatModule` imports `ProjectsModule` to inject `ProjectsService` into `IginiToolsService`).

`ProjectsService` currently has no consumer outside its own module (`exports` is absent from `@Module({...})`), so nothing else can inject it yet.

- [ ] **Step 1: Write the failing test**

Create `backend/src/projects/projects.module.spec.ts`:

```ts
import 'reflect-metadata';
import { ProjectsModule } from './projects.module.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsModule', () => {
  it('exporte ProjectsService, pour que ChatModule puisse l’injecter', () => {
    const exports = Reflect.getMetadata('exports', ProjectsModule) ?? [];
    expect(exports).toContain(ProjectsService);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/projects/projects.module.spec.ts`
Expected: FAIL — `exports` metadata is `undefined`/empty.

- [ ] **Step 3: Add the `exports` array**

In `backend/src/projects/projects.module.ts`, change:

```ts
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
```

to:

```ts
  controllers: [ProjectsController],
  providers: [ProjectsService],
  // Exporté pour que ChatModule puisse appeler les mêmes méthodes que les
  // boutons (analyzeForOwner, createBuildPlanForOwner, ...) depuis les
  // outils de l'orchestrateur, sans dupliquer leur logique.
  exports: [ProjectsService],
})
export class ProjectsModule {}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run src/projects/projects.module.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/projects/projects.module.ts backend/src/projects/projects.module.spec.ts
git commit -m "feat(chat): exporter ProjectsService pour les outils de l'orchestrateur"
```

---

## Task 4: `igini-tools.ts` — tool definitions and input validation (pure)

**Files:**
- Create: `backend/src/igini/chat/igini-tools.ts`
- Create: `backend/src/igini/chat/igini-tools.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ToolName = 'lister_projets' | 'rappeler_souvenirs' | 'analyser' | 'construire' | 'financer' | 'developper' | 'transmettre';
  export const IGINI_TOOL_DEFINITIONS: Anthropic.Tool[];
  export const PROJECT_ID_INPUT_SCHEMA: z.ZodType<{ project_id: string }>;
  export const RAPPELER_SOUVENIRS_INPUT_SCHEMA: z.ZodType<{ project_id?: string; categorie?: MemoryCategory }>;
  export function toToolErrorMessage(error: unknown): string;
  ```
  Consumed by Task 5 (`IginiToolsService`) and Task 8 (`ChatService`, which passes `IGINI_TOOL_DEFINITIONS` to `converseWithTools`).

This file has zero NestJS/Prisma dependency — pure data and pure functions, matching this codebase's convention for cross-cutting shared definitions (see `generator-names.ts`).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/igini/chat/igini-tools.spec.ts`:

```ts
import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  IGINI_TOOL_DEFINITIONS,
  PROJECT_ID_INPUT_SCHEMA,
  RAPPELER_SOUVENIRS_INPUT_SCHEMA,
  toToolErrorMessage,
} from './igini-tools.js';

describe('IGINI_TOOL_DEFINITIONS', () => {
  it('déclare exactement les 7 outils prévus', () => {
    expect(IGINI_TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual(
      ['analyser', 'construire', 'developper', 'financer', 'lister_projets', 'rappeler_souvenirs', 'transmettre'].sort(),
    );
  });

  it('chaque outil a une description non vide', () => {
    for (const tool of IGINI_TOOL_DEFINITIONS) {
      expect(tool.description?.length).toBeGreaterThan(0);
    }
  });

  it('les 5 outils générateurs exigent project_id', () => {
    for (const nom of ['analyser', 'construire', 'financer', 'developper', 'transmettre']) {
      const tool = IGINI_TOOL_DEFINITIONS.find((t) => t.name === nom)!;
      expect(tool.input_schema.required).toContain('project_id');
    }
  });

  it("lister_projets n'exige aucune entrée", () => {
    const tool = IGINI_TOOL_DEFINITIONS.find((t) => t.name === 'lister_projets')!;
    expect(tool.input_schema.required ?? []).toEqual([]);
  });
});

describe('PROJECT_ID_INPUT_SCHEMA', () => {
  it('accepte un project_id', () => {
    expect(PROJECT_ID_INPUT_SCHEMA.parse({ project_id: 'p1' })).toEqual({ project_id: 'p1' });
  });

  it('rejette une entrée sans project_id', () => {
    expect(() => PROJECT_ID_INPUT_SCHEMA.parse({})).toThrow(z.ZodError);
  });
});

describe('RAPPELER_SOUVENIRS_INPUT_SCHEMA', () => {
  it('accepte une entrée vide (souvenirs personnels, toutes catégories)', () => {
    expect(RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse({})).toEqual({});
  });

  it('accepte project_id et categorie', () => {
    expect(RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse({ project_id: 'p1', categorie: 'decision' })).toEqual({
      project_id: 'p1',
      categorie: 'decision',
    });
  });

  it('rejette une categorie inconnue', () => {
    expect(() => RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse({ categorie: 'invention' })).toThrow(z.ZodError);
  });
});

describe('toToolErrorMessage', () => {
  it('extrait le message texte d’une HttpException simple (assertWithinQuota)', () => {
    expect(toToolErrorMessage(new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED))).toBe(
      'Plafond atteint.',
    );
  });

  it('extrait le message texte d’une exception à corps objet (offres.exiger)', () => {
    expect(
      toToolErrorMessage(
        new ForbiddenException({ message: 'Ton offre n’inclut pas ce générateur.', offreQuiOuvre: 'entrepreneur' }),
      ),
    ).toBe('Ton offre n’inclut pas ce générateur.');
  });

  it('extrait le message d’une NotFoundException standard', () => {
    expect(toToolErrorMessage(new NotFoundException('Projet introuvable.'))).toBe('Projet introuvable.');
  });

  it('renvoie un message générique pour une entrée invalide (ZodError)', () => {
    const erreur = PROJECT_ID_INPUT_SCHEMA.safeParse({});
    expect(toToolErrorMessage(erreur.error)).toBe("L'entrée fournie à l'outil est invalide.");
  });

  it('retombe sur error.message pour une erreur générique', () => {
    expect(toToolErrorMessage(new Error('panne réseau'))).toBe('panne réseau');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/chat/igini-tools.spec.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `igini-tools.ts`**

Create `backend/src/igini/chat/igini-tools.ts`:

```ts
import { HttpException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MEMORY_CATEGORIES } from '../memory/memory-category.js';

/**
 * LES 7 OUTILS DE L'ORCHESTRATEUR IGINI.
 *
 * Chacun est une enveloppe fine autour d'un service déjà testé et déjà
 * gardé (offres, quota, propriété du projet) — ce fichier ne décide jamais
 * lui-même si un appel est autorisé, il ne fait que décrire l'outil à
 * Claude et valider la forme de ce qu'il envoie. L'exécution vit dans
 * `IginiToolsService` (igini-tools.service.ts), qui a besoin de Nest/Prisma
 * et donc ne peut pas être ici.
 */
export const TOOL_NAMES = [
  'lister_projets',
  'rappeler_souvenirs',
  'analyser',
  'construire',
  'financer',
  'developper',
  'transmettre',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Les 5 outils qui déclenchent un générateur existant, tous avec la même forme d'entrée. */
const GENERATOR_TOOL_NAMES = ['analyser', 'construire', 'financer', 'developper', 'transmettre'] as const;

export const PROJECT_ID_INPUT_SCHEMA = z.object({
  project_id: z.string().min(1, 'project_id est requis.'),
});

export const RAPPELER_SOUVENIRS_INPUT_SCHEMA = z.object({
  project_id: z.string().min(1).optional(),
  categorie: z.enum(MEMORY_CATEGORIES).optional(),
});

const GENERATOR_TOOL_DESCRIPTIONS: Record<(typeof GENERATOR_TOOL_NAMES)[number], string> = {
  analyser:
    "Lance l'étape Analyser d'Igini sur un projet précis : résumé, score de faisabilité, points forts, " +
    "risques, prochaines étapes. Coûte un appel IA et compte dans le quota du plan de la personne — ne " +
    "l'appelle que si elle l'a explicitement demandé ou confirmé.",
  construire:
    'Lance l’étape Construire (plan de construction : jalons, délai estimé, ressources clés). Mêmes ' +
    'règles de confirmation que analyser.',
  financer:
    'Lance l’étape Financer (plan de financement : budget estimé, sources, postes de dépense). Mêmes ' +
    'règles de confirmation que analyser.',
  developper:
    'Lance l’étape Développer (plan de croissance : leviers, indicateurs clés, risques). Mêmes règles de ' +
    'confirmation que analyser.',
  transmettre:
    'Lance l’étape Transmettre (options de transfert, documentation, check-list). Mêmes règles de ' +
    'confirmation que analyser.',
};

const generatorTools: Anthropic.Tool[] = GENERATOR_TOOL_NAMES.map((name) => ({
  name,
  description: GENERATOR_TOOL_DESCRIPTIONS[name],
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: "UUID du projet, obtenu via l'outil lister_projets si tu ne le connais pas déjà.",
      },
    },
    required: ['project_id'],
  },
}));

export const IGINI_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'lister_projets',
    description:
      'Liste les projets de la personne connectée (identifiant, titre, secteur). Utilise cet outil pour ' +
      "retrouver l'identifiant d'un projet mentionné par son nom, avant d'appeler un autre outil qui a " +
      'besoin de project_id.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'rappeler_souvenirs',
    description:
      "Relit les souvenirs déjà enregistrés (décisions, préférences, apprentissages, faits) de la " +
      'personne, éventuellement filtrés par projet et par catégorie. Sans project_id, ne renvoie que ses ' +
      'souvenirs personnels non liés à un projet précis.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUID du projet (optionnel).' },
        categorie: {
          type: 'string',
          enum: [...MEMORY_CATEGORIES],
          description: 'Filtrer par catégorie (optionnel).',
        },
      },
      required: [],
    },
  },
  ...generatorTools,
];

/**
 * Traduit n'importe quelle erreur d'exécution d'outil en texte lisible pour
 * `tool_result`. Couvre les trois formes réellement rencontrées : une
 * `HttpException` à corps texte (`assertWithinQuota`), une `HttpException` à
 * corps objet (`offres.exiger`, qui pose `{ message, offreQuiOuvre, ... }`),
 * et une entrée invalide envoyée par le modèle (`ZodError`).
 */
export function toToolErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "L'entrée fournie à l'outil est invalide.";
  }
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' ');
    return error.message;
  }
  return error instanceof Error ? error.message : 'Erreur inconnue.';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/chat/igini-tools.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/igini/chat/igini-tools.ts backend/src/igini/chat/igini-tools.spec.ts
git commit -m "feat(chat): declarer les 7 outils de l'orchestrateur (definitions pures)"
```

---

## Task 5: `IginiToolsService` — the executor

**Files:**
- Create: `backend/src/igini/chat/igini-tools.service.ts`
- Create: `backend/src/igini/chat/igini-tools.service.spec.ts`

**Interfaces:**
- Consumes: `PROJECT_ID_INPUT_SCHEMA`, `RAPPELER_SOUVENIRS_INPUT_SCHEMA`, `toToolErrorMessage` (Task 4), `PrismaService`, `MemoryService.search` (pre-existing, `backend/src/igini/memory/memory.service.ts`), `ProjectsService.analyzeForOwner`/`createBuildPlanForOwner`/`createFinancingPlanForOwner`/`createDevelopmentPlanForOwner`/`createTransmissionPlanForOwner` (pre-existing, now exported per Task 3).
- Produces:
  ```ts
  export interface ToolResult { content: string; isError: boolean }
  class IginiToolsService {
    execute(name: string, rawInput: unknown, ctx: { userId: string }): Promise<ToolResult>;
  }
  ```
  Consumed by Task 8 (`ChatService`, which passes `(name, input) => this.iginiTools.execute(name, input, { userId })` as the `executeTool` callback to `converseWithTools`).

**This is the only file in the plan allowed to call `ProjectsService`'s generator methods and `MemoryService.search` directly — it never calls Claude.**

- [ ] **Step 1: Write the failing tests**

Create `backend/src/igini/chat/igini-tools.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from '../memory/memory.service.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IginiToolsService } from './igini-tools.service.js';

describe('IginiToolsService', () => {
  let service: IginiToolsService;
  let prisma: { projects: { findMany: ReturnType<typeof vi.fn> } };
  let memory: { search: ReturnType<typeof vi.fn> };
  let projects: {
    analyzeForOwner: ReturnType<typeof vi.fn>;
    createBuildPlanForOwner: ReturnType<typeof vi.fn>;
    createFinancingPlanForOwner: ReturnType<typeof vi.fn>;
    createDevelopmentPlanForOwner: ReturnType<typeof vi.fn>;
    createTransmissionPlanForOwner: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = { projects: { findMany: vi.fn() } };
    memory = { search: vi.fn() };
    projects = {
      analyzeForOwner: vi.fn(),
      createBuildPlanForOwner: vi.fn(),
      createFinancingPlanForOwner: vi.fn(),
      createDevelopmentPlanForOwner: vi.fn(),
      createTransmissionPlanForOwner: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IginiToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MemoryService, useValue: memory },
        { provide: ProjectsService, useValue: projects },
      ],
    }).compile();

    service = module.get<IginiToolsService>(IginiToolsService);
  });

  describe('lister_projets', () => {
    it("ne renvoie que les projets du bon propriétaire", async () => {
      prisma.projects.findMany.mockResolvedValue([{ id: 'p1', title: 'Boulangerie', sector: 'Alimentation' }]);

      const result = await service.execute('lister_projets', {}, { userId: 'u1' });

      expect(prisma.projects.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { owner_id: 'u1' } }),
      );
      expect(result).toEqual({
        content: JSON.stringify([{ id: 'p1', title: 'Boulangerie', sector: 'Alimentation' }]),
        isError: false,
      });
    });
  });

  describe('rappeler_souvenirs', () => {
    it('transmet project_id et categorie à MemoryService.search', async () => {
      memory.search.mockResolvedValue([{ id: 'm1', content: 'Souvenir' }]);

      await service.execute('rappeler_souvenirs', { project_id: 'p1', categorie: 'decision' }, { userId: 'u1' });

      expect(memory.search).toHaveBeenCalledWith('u1', { projectId: 'p1', category: 'decision' });
    });

    it('fonctionne sans aucune entrée (souvenirs personnels, toutes catégories)', async () => {
      memory.search.mockResolvedValue([]);

      const result = await service.execute('rappeler_souvenirs', {}, { userId: 'u1' });

      expect(memory.search).toHaveBeenCalledWith('u1', { projectId: undefined, category: undefined });
      expect(result.isError).toBe(false);
    });
  });

  describe('outils générateurs', () => {
    it('analyser appelle ProjectsService.analyzeForOwner avec le bon projet', async () => {
      projects.analyzeForOwner.mockResolvedValue({ id: 'a1', feasibility_score: 7 });

      const result = await service.execute('analyser', { project_id: 'p1' }, { userId: 'u1' });

      expect(projects.analyzeForOwner).toHaveBeenCalledWith('u1', 'p1');
      expect(result).toEqual({ content: JSON.stringify({ id: 'a1', feasibility_score: 7 }), isError: false });
    });

    it("transforme une ForbiddenException (offre insuffisante) en tool_result d'erreur, sans planter", async () => {
      projects.createBuildPlanForOwner.mockRejectedValue(
        new ForbiddenException({ message: 'Ton offre n’inclut pas ce générateur.' }),
      );

      const result = await service.execute('construire', { project_id: 'p1' }, { userId: 'u1' });

      expect(result).toEqual({ content: 'Ton offre n’inclut pas ce générateur.', isError: true });
    });

    it('transforme une NotFoundException (projet inconnu) en tool_result d’erreur', async () => {
      projects.analyzeForOwner.mockRejectedValue(new NotFoundException('Projet introuvable.'));

      const result = await service.execute('analyser', { project_id: 'inexistant' }, { userId: 'u1' });

      expect(result).toEqual({ content: 'Projet introuvable.', isError: true });
    });

    it("renvoie une erreur de validation sans planter quand project_id est absent", async () => {
      const result = await service.execute('financer', {}, { userId: 'u1' });

      expect(result.isError).toBe(true);
      expect(projects.createFinancingPlanForOwner).not.toHaveBeenCalled();
    });
  });

  it('renvoie une erreur pour un nom d’outil inconnu, sans planter', async () => {
    const result = await service.execute('supprimer_tout', {}, { userId: 'u1' });

    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/chat/igini-tools.service.spec.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `igini-tools.service.ts`**

Create `backend/src/igini/chat/igini-tools.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { MemoryService } from '../memory/memory.service.js';
import { PROJECT_ID_INPUT_SCHEMA, RAPPELER_SOUVENIRS_INPUT_SCHEMA, toToolErrorMessage } from './igini-tools.js';

export interface ToolResult {
  content: string;
  isError: boolean;
}

/**
 * EXÉCUTEUR DES 7 OUTILS DE L'ORCHESTRATEUR.
 *
 * N'appelle jamais Claude — seulement des services NestJS déjà existants et
 * déjà gardés. `execute()` ne laisse jamais une exception remonter : elle
 * devient toujours un `ToolResult` avec `isError: true`, pour que Claude
 * puisse la reformuler à la personne plutôt que de faire planter le tour.
 */
@Injectable()
export class IginiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: MemoryService,
    private readonly projects: ProjectsService,
  ) {}

  async execute(name: string, rawInput: unknown, ctx: { userId: string }): Promise<ToolResult> {
    try {
      switch (name) {
        case 'lister_projets':
          return await this.listerProjets(ctx.userId);
        case 'rappeler_souvenirs':
          return await this.rappelerSouvenirs(rawInput, ctx.userId);
        case 'analyser':
          return await this.declencherGenerateur(rawInput, (id) => this.projects.analyzeForOwner(ctx.userId, id));
        case 'construire':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createBuildPlanForOwner(ctx.userId, id),
          );
        case 'financer':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createFinancingPlanForOwner(ctx.userId, id),
          );
        case 'developper':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createDevelopmentPlanForOwner(ctx.userId, id),
          );
        case 'transmettre':
          return await this.declencherGenerateur(rawInput, (id) =>
            this.projects.createTransmissionPlanForOwner(ctx.userId, id),
          );
        default:
          return { content: `Outil inconnu : ${name}.`, isError: true };
      }
    } catch (error) {
      return { content: toToolErrorMessage(error), isError: true };
    }
  }

  private async listerProjets(userId: string): Promise<ToolResult> {
    const projects = await this.prisma.projects.findMany({
      where: { owner_id: userId },
      select: { id: true, title: true, sector: true },
      orderBy: { created_at: 'desc' },
    });
    return { content: JSON.stringify(projects), isError: false };
  }

  private async rappelerSouvenirs(rawInput: unknown, userId: string): Promise<ToolResult> {
    const input = RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse(rawInput);
    const memories = await this.memory.search(userId, {
      projectId: input.project_id,
      category: input.categorie,
    });
    return { content: JSON.stringify(memories), isError: false };
  }

  private async declencherGenerateur(
    rawInput: unknown,
    appeler: (projectId: string) => Promise<unknown>,
  ): Promise<ToolResult> {
    const input = PROJECT_ID_INPUT_SCHEMA.parse(rawInput);
    const result = await appeler(input.project_id);
    return { content: JSON.stringify(result), isError: false };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/chat/igini-tools.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/igini/chat/igini-tools.service.ts backend/src/igini/chat/igini-tools.service.spec.ts
git commit -m "feat(chat): ajouter IginiToolsService (execution des 7 outils)"
```

---

## Task 6: `toClaudeMessages` — strict role alternation helper (seed history builder)

**Files:**
- Create: `backend/src/igini/chat/chat-message-window.ts`
- Create: `backend/src/igini/chat/chat-message-window.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StoredChatMessage { role: 'user' | 'igini'; content: string }
  export interface ClaudeChatMessage { role: 'user' | 'assistant'; content: string }
  export function toClaudeMessages(rows: readonly StoredChatMessage[]): ClaudeChatMessage[]
  ```
  Consumed by Task 8 (`ChatService.sendMessage`, to build the seed `messages` array passed into `converseWithTools`).

This builds the **seed** history only (what was actually persisted — final user/Igini turns, never intermediate tool calls, per the Global Constraints). `converseWithTools` (Task 7) extends this seed in-memory during its own 3-turn loop; that in-memory extension is never written back through this function.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/igini/chat/chat-message-window.spec.ts`:

```ts
import { toClaudeMessages } from './chat-message-window.js';

describe('toClaudeMessages', () => {
  it('convertit le rôle igini en assistant', () => {
    expect(
      toClaudeMessages([
        { role: 'user', content: 'Salut' },
        { role: 'igini', content: 'Bonjour !' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Salut' },
      { role: 'assistant', content: 'Bonjour !' },
    ]);
  });

  it('fusionne deux messages user consécutifs (tour précédent resté sans réponse)', () => {
    expect(
      toClaudeMessages([
        { role: 'user', content: 'Première question' },
        { role: 'user', content: 'Deuxième question, sans réponse entre les deux' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Première question\nDeuxième question, sans réponse entre les deux' },
    ]);
  });

  it('retire les messages igini en tête, avant le premier message user', () => {
    expect(
      toClaudeMessages([
        { role: 'igini', content: 'Orpheline' },
        { role: 'user', content: 'Salut' },
      ]),
    ).toEqual([{ role: 'user', content: 'Salut' }]);
  });

  it('renvoie un tableau vide pour un historique vide', () => {
    expect(toClaudeMessages([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/chat/chat-message-window.spec.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `chat-message-window.ts`**

Create `backend/src/igini/chat/chat-message-window.ts`:

```ts
/**
 * Transforme l'historique stocké en messages au format attendu par l'API
 * Claude (rôles strictement alternés `user`/`assistant`, en commençant par
 * `user`).
 *
 * Nécessaire parce qu'un tour peut échouer après que le message de
 * l'utilisateur a déjà été persisté (plafond de coût atteint, panne du
 * SDK...) : la ligne reste en base sans réponse d'Igini associée, et
 * l'historique peut alors contenir deux messages `user` consécutifs. L'API
 * Claude refuse une liste de messages qui ne respecte pas l'alternance
 * stricte — les fusionner ici évite de reproduire ce défaut dans chaque
 * appelant.
 */
export interface StoredChatMessage {
  role: 'user' | 'igini';
  content: string;
}

export interface ClaudeChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function toClaudeMessages(rows: readonly StoredChatMessage[]): ClaudeChatMessage[] {
  const merged: ClaudeChatMessage[] = [];

  for (const row of rows) {
    const role = row.role === 'igini' ? 'assistant' : 'user';
    const last = merged[merged.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n${row.content}`;
    } else {
      merged.push({ role, content: row.content });
    }
  }

  // Claude exige que le premier message soit de l'utilisateur : un
  // historique qui commencerait par une réponse ne devrait jamais arriver
  // en pratique, mais le retirer plutôt que planter reste le choix le plus
  // sûr si ça se produisait (donnée ancienne, incident).
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift();
  }

  return merged;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/chat/chat-message-window.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/igini/chat/chat-message-window.ts backend/src/igini/chat/chat-message-window.spec.ts
git commit -m "feat(chat): ajouter toClaudeMessages (alternance stricte des roles)"
```

---

## Task 7: `ClaudeService.converseWithTools()`

**Files:**
- Modify: `backend/src/igini/claude/claude.service.ts`
- Modify: `backend/src/igini/claude/claude.service.spec.ts`

**Interfaces:**
- Consumes: `AiUsageContext` (Task 2, `projectId: string | null`), `Anthropic.Tool`/`Anthropic.ToolResultBlockParam`/`Anthropic.ToolUseBlock`/`Anthropic.MessageParam` (SDK types), `this.availability()`, `this.aiUsage.assertWithinQuota()`, `this.aiUsage.record()`, `this.toSafeMessage()` (pre-existing members of `ClaudeService`).
- Produces:
  ```ts
  export interface ToolResult { content: string; isError: boolean } // re-declared here to avoid a Claude-module → chat-module import; structurally identical to Task 5's ToolResult
  export interface ConverseWithToolsRequest {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    usage: AiUsageContext;
    tools: Anthropic.Tool[];
    executeTool: (name: string, input: unknown) => Promise<ToolResult>;
  }
  export const CLAUDE_ORCHESTRATOR_MODEL: string;
  ClaudeService.converseWithTools(request: ConverseWithToolsRequest): Promise<string>
  ```
  Consumed by Task 8 (`ChatService.sendMessage`).

**Why `ToolResult` is redeclared here rather than imported from `igini-tools.ts` (Task 5):** `backend/src/igini/claude/` has no existing dependency on `backend/src/igini/chat/`, and this plan doesn't want to invent one just for a two-field interface. Both declarations must stay structurally identical (`{ content: string; isError: boolean }`) — TypeScript's structural typing accepts passing one where the other is expected, so this compiles without a shared import.

- [ ] **Step 1: Add a `create` mock alongside the existing `parse` mock**

In `backend/src/igini/claude/claude.service.spec.ts`, change:

```ts
const parseMock = vi.fn();
```

to:

```ts
const parseMock = vi.fn();
const createMock = vi.fn();
```

and change:

```ts
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { parse: parseMock };
  }
```

to:

```ts
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { parse: parseMock, create: createMock };
  }
```

and in `beforeEach`, change:

```ts
    parseMock.mockReset();
```

to:

```ts
    parseMock.mockReset();
    createMock.mockReset();
```

- [ ] **Step 2: Import `CLAUDE_MODEL` in the spec file**

In `backend/src/igini/claude/claude.service.spec.ts`, change:

```ts
import { ClaudeService } from './claude.service.js';
```

to:

```ts
import { CLAUDE_MODEL, ClaudeService } from './claude.service.js';
```

(`CLAUDE_MODEL` isn't used by these new tests directly, but confirms the orchestrator uses a *different* constant — see the model-separation test below, which imports `CLAUDE_ORCHESTRATOR_MODEL` too.)

- [ ] **Step 3: Write the failing tests**

At the end of the `describe('ClaudeService', ...)` block in `claude.service.spec.ts` (just before its closing `});`), add:

```ts
  describe('converseWithTools', () => {
    const CHAT_ATTRIBUTION = { userId: 'u1', projectId: null, generator: 'discuter' } as const;
    const UN_OUTIL: Anthropic.Tool = {
      name: 'lister_projets',
      description: 'Liste les projets.',
      input_schema: { type: 'object', properties: {}, required: [] },
    };

    function reponseTexte(texte: string) {
      return { content: [{ type: 'text', text: texte }], usage: UTILISATION };
    }

    function reponseToolUse(id: string, name: string, input: unknown) {
      return { content: [{ type: 'tool_use', id, name, input }], usage: UTILISATION };
    }

    const converser = (executeTool = vi.fn()) =>
      service.converseWithTools({
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'Salut Igini' }],
        usage: CHAT_ATTRIBUTION,
        tools: [UN_OUTIL],
        executeTool,
      });

    it("n'envoie AUCUNE requête quand les générateurs sont éteints", async () => {
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(converser()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('refuse avant tout appel réseau quand le plafond de coût global est atteint', async () => {
      aiUsage.assertWithinQuota.mockRejectedValue(
        new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED),
      );

      await expect(converser()).rejects.toBeInstanceOf(HttpException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('utilise un modèle distinct de celui des 5 générateurs, et journalise dessous', async () => {
      createMock.mockResolvedValue(reponseTexte('Salut !'));

      await converser();

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: CLAUDE_ORCHESTRATOR_MODEL }));
      expect(CLAUDE_ORCHESTRATOR_MODEL).not.toBe(CLAUDE_MODEL);
      expect(aiUsage.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: CHAT_ATTRIBUTION, model: CLAUDE_ORCHESTRATOR_MODEL }),
      );
    });

    it("n'appelle jamais offres.exiger — le tour de conversation reste hors du système d'offres", async () => {
      createMock.mockResolvedValue(reponseTexte('Salut !'));

      await converser();

      expect(offres.exiger).not.toHaveBeenCalled();
    });

    it('répond directement quand Claude ne demande aucun outil', async () => {
      createMock.mockResolvedValue(reponseTexte('Bonjour, comment puis-je aider ?'));

      const result = await converser();

      expect(result).toBe('Bonjour, comment puis-je aider ?');
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('exécute un outil demandé puis renvoie la réponse finale du tour suivant', async () => {
      createMock
        .mockResolvedValueOnce(reponseToolUse('t1', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseTexte('Tu as un projet : Boulangerie.'));
      const executeTool = vi.fn().mockResolvedValue({ content: '[{"id":"p1"}]', isError: false });

      const result = await converser(executeTool);

      expect(executeTool).toHaveBeenCalledWith('lister_projets', {});
      expect(result).toBe('Tu as un projet : Boulangerie.');
      expect(createMock).toHaveBeenCalledTimes(2);
      // Le deuxième appel doit porter le tool_result rattaché au bon tool_use_id.
      const secondAppel = createMock.mock.calls[1][0];
      const dernierMessage = secondAppel.messages[secondAppel.messages.length - 1];
      expect(dernierMessage).toEqual({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: '[{"id":"p1"}]', is_error: false }],
      });
    });

    it("n'exécute JAMAIS un outil sur le dernier tour autorisé — un générateur payant ne doit jamais tourner sans qu'on puisse en rendre compte", async () => {
      // Les 3 appels renvoient tous du tool_use : aucun n'est le dernier mot.
      createMock
        .mockResolvedValueOnce(reponseToolUse('t1', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseToolUse('t2', 'lister_projets', {}))
        .mockResolvedValueOnce(reponseToolUse('t3', 'analyser', { project_id: 'p1' }));
      const executeTool = vi.fn().mockResolvedValue({ content: '[]', isError: false });

      const result = await converser(executeTool);

      expect(createMock).toHaveBeenCalledTimes(3);
      // Seuls les 2 premiers tool_use (tours 1 et 2) sont exécutés — jamais le 3e.
      expect(executeTool).toHaveBeenCalledTimes(2);
      expect(executeTool).not.toHaveBeenCalledWith('analyser', { project_id: 'p1' });
      expect(result).toBe("Je n'ai pas pu terminer cette demande, peux-tu préciser ?");
    });

    it("lève une InternalServerErrorException si l'appel Claude échoue", async () => {
      createMock.mockRejectedValue(new Error('network error'));

      await expect(converser()).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
```

- [ ] **Step 4: Import `Anthropic` as a type in the spec file**

In `backend/src/igini/claude/claude.service.spec.ts`, add near the top (after the existing `import { z } from 'zod';`):

```ts
import type Anthropic from '@anthropic-ai/sdk';
```

- [ ] **Step 5: Run the new tests to verify they fail**

Run: `cd backend && npx vitest run src/igini/claude/claude.service.spec.ts`
Expected: FAIL — `service.converseWithTools` is not a function, `CLAUDE_ORCHESTRATOR_MODEL` is not exported.

- [ ] **Step 6: Implement `converseWithTools` in `claude.service.ts`**

In `backend/src/igini/claude/claude.service.ts`, add this near `CLAUDE_MODEL`:

```ts
/**
 * Modèle utilisé par l'orchestrateur du chat (tours de conversation), pas
 * par les 5 générateurs — délibérément plus rapide/économique, puisqu'un
 * tour de conversation ordinaire en enchaîne plusieurs par message envoyé,
 * contrairement à une génération ponctuelle. `CLAUDE_MODEL` reste inchangé
 * et continue de servir les 5 générateurs, appelés directement ou via un
 * outil de l'orchestrateur.
 */
export const CLAUDE_ORCHESTRATOR_MODEL = 'claude-haiku-4-5';

/** Nombre maximal d'appels Claude pour un seul message envoyé au chat. */
const MAX_ORCHESTRATION_TURNS = 3;

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface ConverseWithToolsRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Attribution du tour de conversation : `usage.projectId` vaut toujours `null`. */
  usage: AiUsageContext;
  tools: Anthropic.Tool[];
  executeTool: (name: string, input: unknown) => Promise<ToolResult>;
}
```

Then add this method to the `ClaudeService` class, right after `generateStructuredOutput` (before `private toSafeMessage`):

```ts
  /**
   * Chat orchestré : jusqu'à `MAX_ORCHESTRATION_TURNS` allers-retours entre
   * Claude et les outils NestJS existants. Contrairement à
   * `generateStructuredOutput`, n'appelle jamais `OffresService.exiger()`
   * pour le tour lui-même — le chat reste hors du système d'offres ; seuls
   * les outils générateurs le font, via le code existant qu'ils invoquent.
   *
   * Règle de sécurité non négociable : sur le DERNIER tour autorisé, un
   * outil demandé par Claude n'est jamais exécuté. Sans tour suivant pour
   * en rendre compte à la personne, un outil à effet de bord — un
   * générateur payant, qui écrit réellement en base — tournerait sans
   * qu'elle ne le sache jamais. Le message de repli explicite est renvoyé
   * à la place.
   */
  async converseWithTools(request: ConverseWithToolsRequest): Promise<string> {
    const availability = this.availability();
    if (!availability.enabled) {
      throw new ServiceUnavailableException(availability.reason);
    }

    await this.aiUsage.assertWithinQuota(request.usage.userId);

    let apiMessages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let turn = 0; turn < MAX_ORCHESTRATION_TURNS; turn++) {
      const startedAt = Date.now();
      let response: Anthropic.Message;
      try {
        response = await this.getClient().messages.create({
          model: CLAUDE_ORCHESTRATOR_MODEL,
          max_tokens: 2048,
          system: request.systemPrompt,
          messages: apiMessages,
          tools: request.tools,
        });
      } catch (error) {
        this.logger.error("Échec d'un tour d'orchestration du chat via Claude", error as Error);
        throw new InternalServerErrorException(
          this.toSafeMessage(error, "IGINI n'a pas pu répondre, réessaie dans un instant."),
        );
      }

      await this.aiUsage
        .record({
          context: request.usage,
          model: CLAUDE_ORCHESTRATOR_MODEL,
          usage: response.usage,
          durationMs: Date.now() - startedAt,
        })
        .catch((error: unknown) => {
          this.logger.error(
            "Coût IA non journalisé (orchestration du chat) : la dépense a eu lieu mais manquera aux totaux.",
            error as Error,
          );
        });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        if (!text) {
          throw new InternalServerErrorException("IGINI n'a pas pu répondre, réessaie dans un instant.");
        }
        return text;
      }

      if (turn === MAX_ORCHESTRATION_TURNS - 1) {
        return "Je n'ai pas pu terminer cette demande, peux-tu préciser ?";
      }

      apiMessages = [...apiMessages, { role: 'assistant', content: response.content }];

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await request.executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        });
      }

      apiMessages = [...apiMessages, { role: 'user', content: toolResults }];
    }

    // Inatteignable : le corps de boucle retourne toujours avant la fin du
    // dernier tour (soit un texte, soit le message de repli ci-dessus).
    // Conservé pour que TypeScript voie un retour explicite sur tous les
    // chemins.
    return "Je n'ai pas pu terminer cette demande, peux-tu préciser ?";
  }
```

- [ ] **Step 7: Import `Anthropic` as a type in `claude.service.ts`**

Check the existing imports at the top of `claude.service.ts` — `Anthropic` is already imported as the default SDK class (`import Anthropic from '@anthropic-ai/sdk';`), which also carries its namespaced types (`Anthropic.Tool`, `Anthropic.Message`, `Anthropic.MessageParam`, `Anthropic.ToolUseBlock`, `Anthropic.ToolResultBlockParam`, `Anthropic.TextBlock`) — no new import needed.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/igini/claude/claude.service.spec.ts`
Expected: PASS, all tests including the pre-existing `generateStructuredOutput` ones.

- [ ] **Step 9: Commit**

```bash
git add backend/src/igini/claude/claude.service.ts backend/src/igini/claude/claude.service.spec.ts
git commit -m "feat(chat): ajouter ClaudeService.converseWithTools (orchestrateur a outils, 3 tours max)"
```

---

## Task 8: `ChatService` — wired to `converseWithTools`

**Files:**
- Create: `backend/src/igini/chat/chat.service.ts`
- Create: `backend/src/igini/chat/chat.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.chat_messages` (`create`, `findMany`), `ClaudeService.converseWithTools` (Task 7), `toClaudeMessages` (Task 6), `IGINI_TOOL_DEFINITIONS` (Task 4), `IginiToolsService.execute` (Task 5), `buildSystemPrompt` (pre-existing, `backend/src/igini/claude/igini-identity.ts`).
- Produces:
  ```ts
  export const CHAT_HISTORY_WINDOW = 20;
  class ChatService {
    sendMessage(userId: string, content: string): Promise<{ id: string; role: string; content: string; created_at: Date | null }>;
    history(userId: string, limit?: number): Promise<Array<{ id: string; role: string; content: string; created_at: Date | null }>>;
  }
  ```
  Consumed by Task 9 (`ChatController`).

The two text markers (`[[projet: …]]`, `[[souvenir: …]]`) are produced here, in the system prompt, and consumed by the frontend in Task 11 — nothing server-side parses them; Igini's final text (markers included) is persisted and returned as-is.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/igini/chat/chat.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { IginiToolsService } from './igini-tools.service.js';
import { CHAT_HISTORY_WINDOW, ChatService } from './chat.service.js';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chat_messages: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let claude: { converseWithTools: ReturnType<typeof vi.fn> };
  let iginiTools: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = { chat_messages: { create: vi.fn(), findMany: vi.fn() } };
    claude = { converseWithTools: vi.fn() };
    iginiTools = { execute: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
        { provide: IginiToolsService, useValue: iginiTools },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('sendMessage', () => {
    it('persiste le message utilisateur avant d’appeler Claude, puis persiste la réponse finale', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create
        .mockResolvedValueOnce({ id: 'm1', role: 'user', content: 'Salut' })
        .mockResolvedValueOnce({ id: 'm2', role: 'igini', content: 'Bonjour !' });
      claude.converseWithTools.mockResolvedValue('Bonjour !');

      const result = await service.sendMessage('u1', 'Salut');

      expect(prisma.chat_messages.create).toHaveBeenNthCalledWith(1, {
        data: { user_id: 'u1', role: 'user', content: 'Salut' },
      });
      expect(prisma.chat_messages.create).toHaveBeenNthCalledWith(2, {
        data: { user_id: 'u1', role: 'igini', content: 'Bonjour !' },
      });
      expect(result).toEqual({ id: 'm2', role: 'igini', content: 'Bonjour !' });
    });

    it('envoie la fenêtre des messages précédents, du plus ancien au plus récent, plus le nouveau message', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([
        { role: 'igini', content: 'Réponse récente' },
        { role: 'user', content: 'Question récente' },
      ]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'Suite' });
      claude.converseWithTools.mockResolvedValue('Suite');

      await service.sendMessage('u1', 'Nouvelle question');

      expect(claude.converseWithTools).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Question récente' },
            { role: 'assistant', content: 'Réponse récente' },
            { role: 'user', content: 'Nouvelle question' },
          ],
        }),
      );
    });

    it("attribue l'appel au chat, sans projet, avec les 7 outils, et relie l'exécuteur à IginiToolsService", async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });
      claude.converseWithTools.mockResolvedValue('ok');

      await service.sendMessage('u1', 'Salut');

      const appel = claude.converseWithTools.mock.calls[0][0];
      expect(appel.usage).toEqual({ userId: 'u1', projectId: null, generator: 'discuter' });
      expect(appel.tools.map((t: { name: string }) => t.name).sort()).toEqual(
        ['analyser', 'construire', 'developper', 'financer', 'lister_projets', 'rappeler_souvenirs', 'transmettre'].sort(),
      );

      iginiTools.execute.mockResolvedValue({ content: '[]', isError: false });
      await appel.executeTool('lister_projets', {});
      expect(iginiTools.execute).toHaveBeenCalledWith('lister_projets', {}, { userId: 'u1' });
    });

    it("limite la fenêtre au nombre de messages configuré", async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });
      claude.converseWithTools.mockResolvedValue('ok');

      await service.sendMessage('u1', 'Salut');

      expect(prisma.chat_messages.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 'u1' }, take: CHAT_HISTORY_WINDOW }),
      );
    });
  });

  describe('history', () => {
    it('renvoie les messages du plus ancien au plus récent', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([
        { id: 'm2', role: 'igini', content: 'Récent' },
        { id: 'm1', role: 'user', content: 'Ancien' },
      ]);

      const result = await service.history('u1');

      expect(result).toEqual([
        { id: 'm1', role: 'user', content: 'Ancien' },
        { id: 'm2', role: 'igini', content: 'Récent' },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/chat/chat.service.spec.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `chat.service.ts`**

Create `backend/src/igini/chat/chat.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';
import { toClaudeMessages } from './chat-message-window.js';
import { IGINI_TOOL_DEFINITIONS } from './igini-tools.js';
import { IginiToolsService } from './igini-tools.service.js';

/**
 * Combien de messages passés servent de contexte à un nouvel appel — au-delà,
 * le coût par appel grimpe sans ajouter grand-chose à une conversation.
 */
export const CHAT_HISTORY_WINDOW = 20;

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu peux à la fois répondre en conversation libre et agir via des
outils : lister les projets de la personne (lister_projets), relire ses souvenirs (rappeler_souvenirs), ou
déclencher l'une des cinq étapes de ta méthode (analyser, construire, financer, developper, transmettre) sur un
projet précis.

Règle stricte : n'appelle un outil générateur (analyser/construire/financer/developper/transmettre) que si la
personne l'a explicitement demandé dans son dernier message, ou a confirmé une proposition que tu viens de lui
faire. Ne le fais jamais de façon spéculative, même si tu penses que ce serait utile.

Si un outil te renvoie une erreur (plafond atteint, offre insuffisante, projet introuvable...), explique la
situation à la personne dans tes mots, sans lui montrer de message technique brut.

Si tu viens de déclencher un générateur, termine ta réponse par le projet concerné sur sa propre ligne, au
format exact : [[projet: L_IDENTIFIANT_DU_PROJET]]. N'écris jamais ce format dans un autre contexte.

Si un élément de la conversation mérite d'être retenu en mémoire, et seulement si la personne semble d'accord
pour le garder, propose-le en langage naturel puis termine ta réponse par le contenu suggéré sur sa propre
ligne, au format exact : [[souvenir: LE_CONTENU_A_RETENIR]]. Tu ne peux jamais écrire un souvenir toi-même —
seule la personne peut confirmer, en cliquant sur le bouton que ce format fait apparaître.`);

/**
 * CHAT — la conversation orchestrée avec Igini. Un seul fil continu par
 * utilisateur : `sendMessage` persiste le tour de la personne avant
 * d'appeler Claude, pour que le message reste visible dans l'historique
 * même si la réponse échoue (plafond atteint, panne réseau...). Le détail
 * des outils appelés pendant le tour n'est jamais persisté — seule la
 * réponse finale en langage naturel l'est, via `ClaudeService.converseWithTools`.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly iginiTools: IginiToolsService,
  ) {}

  async sendMessage(userId: string, content: string) {
    const previous = await this.prisma.chat_messages.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: CHAT_HISTORY_WINDOW,
    });

    await this.prisma.chat_messages.create({
      data: { user_id: userId, role: 'user', content },
    });

    const ordered = [...previous].reverse();
    const claudeMessages = toClaudeMessages([...ordered, { role: 'user' as const, content }]);

    const reply = await this.claude.converseWithTools({
      systemPrompt: SYSTEM_PROMPT,
      messages: claudeMessages,
      usage: { userId, projectId: null, generator: 'discuter' },
      tools: IGINI_TOOL_DEFINITIONS,
      executeTool: (name, input) => this.iginiTools.execute(name, input, { userId }),
    });

    return this.prisma.chat_messages.create({
      data: { user_id: userId, role: 'igini', content: reply },
    });
  }

  async history(userId: string, limit = 50) {
    const messages = await this.prisma.chat_messages.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return messages.reverse();
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/chat/chat.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/igini/chat/chat.service.ts backend/src/igini/chat/chat.service.spec.ts
git commit -m "feat(chat): brancher ChatService sur converseWithTools et les 7 outils"
```

---

## Task 9: `ChatController`, DTO, `ChatModule`, and registration

**Files:**
- Create: `backend/src/igini/chat/dto/send-chat-message.dto.ts`
- Create: `backend/src/igini/chat/chat.controller.ts`
- Create: `backend/src/igini/chat/chat.controller.spec.ts`
- Create: `backend/src/igini/chat/chat.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ChatService.sendMessage`/`history` (Task 8), `IginiToolsService` (Task 5), `CurrentUser`/`AuthenticatedUser` (`backend/src/auth/current-user.decorator.ts`), `JwtAuthGuard` (`backend/src/auth/jwt-auth.guard.ts`), `ClaudeModule` (`backend/src/igini/claude/claude.module.ts`), `AuthModule` (`backend/src/auth/auth.module.ts`), `MemoryModule` (`backend/src/igini/memory/memory.module.ts`, exports `MemoryService`), `ProjectsModule` (Task 3, now exports `ProjectsService`).
- Produces: `POST /chat/messages`, `GET /chat/messages?limit=`. Consumed by Task 10 (frontend `api.ts`).

- [ ] **Step 1: Create the DTO**

Create `backend/src/igini/chat/dto/send-chat-message.dto.ts`:

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @MinLength(1, { message: 'content ne peut pas être vide.' })
  @MaxLength(4000, { message: 'content ne doit pas dépasser 4000 caractères.' })
  content: string;
}
```

- [ ] **Step 2: Write the failing controller tests**

Create `backend/src/igini/chat/chat.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: { sendMessage: ReturnType<typeof vi.fn>; history: ReturnType<typeof vi.fn> };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    chatService = { sendMessage: vi.fn(), history: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it("send délègue au service avec l'utilisateur courant", async () => {
    chatService.sendMessage.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });

    const result = await controller.send(currentUser, { content: 'Salut' });

    expect(chatService.sendMessage).toHaveBeenCalledWith('u1', 'Salut');
    expect(result).toEqual({ id: 'm2', role: 'igini', content: 'ok' });
  });

  it('history délègue au service avec la limite fournie', async () => {
    chatService.history.mockResolvedValue([{ id: 'm1' }]);

    const result = await controller.history(currentUser, '10');

    expect(chatService.history).toHaveBeenCalledWith('u1', 10);
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('history retombe sur la limite par défaut si le paramètre est invalide', async () => {
    chatService.history.mockResolvedValue([]);

    await controller.history(currentUser, 'abc');

    expect(chatService.history).toHaveBeenCalledWith('u1', undefined);
  });

  it("history retombe sur la limite par défaut si aucun paramètre n'est fourni", async () => {
    chatService.history.mockResolvedValue([]);

    await controller.history(currentUser, undefined);

    expect(chatService.history).toHaveBeenCalledWith('u1', undefined);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && npx vitest run src/igini/chat/chat.controller.spec.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 4: Implement the controller**

Create `backend/src/igini/chat/chat.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ChatService } from './chat.service.js';
import { SendChatMessageDto } from './dto/send-chat-message.dto.js';

@ApiTags('igini-chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendChatMessageDto) {
    return this.chatService.sendMessage(user.id, dto.content);
  }

  @Get('messages')
  history(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    const valide = parsed !== undefined && Number.isInteger(parsed) && parsed > 0;
    return this.chatService.history(user.id, valide ? parsed : undefined);
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd backend && npx vitest run src/igini/chat/chat.controller.spec.ts`
Expected: PASS

- [ ] **Step 6: Create the module**

Create `backend/src/igini/chat/chat.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module.js';
import { ProjectsModule } from '../../projects/projects.module.js';
import { ClaudeModule } from '../claude/claude.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { IginiToolsService } from './igini-tools.service.js';

@Module({
  // Voir MemoryModule pour l'explication de ce couple AuthModule/PassportModule.
  // ProjectsModule et MemoryModule fournissent ProjectsService/MemoryService
  // à IginiToolsService, sans dupliquer leur logique.
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ClaudeModule,
    ProjectsModule,
    MemoryModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, IginiToolsService],
})
export class ChatModule {}
```

- [ ] **Step 7: Register `ChatModule` in `AppModule`**

In `backend/src/app.module.ts`, add the import next to `MemoryModule`'s:

```ts
import { MemoryModule } from './igini/memory/memory.module.js';
```

becomes:

```ts
import { ChatModule } from './igini/chat/chat.module.js';
import { MemoryModule } from './igini/memory/memory.module.js';
```

and in the `imports` array, add it next to `MemoryModule`:

```ts
    ProjectsModule,
    MemoryModule,
```

becomes:

```ts
    ProjectsModule,
    MemoryModule,
    ChatModule,
```

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS, no regressions (this also verifies `ChatModule`'s dependency graph resolves — a broken import here fails the whole run since Nest bootstraps eagerly in e2e/module tests).

- [ ] **Step 9: Commit**

```bash
git add backend/src/igini/chat/dto backend/src/igini/chat/chat.controller.ts backend/src/igini/chat/chat.controller.spec.ts backend/src/igini/chat/chat.module.ts backend/src/app.module.ts
git commit -m "feat(chat): exposer POST/GET /chat/messages (orchestrateur)"
```

---

## Task 10: Frontend API client + base `ChatIgini` component

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/chat-igini.tsx`
- Create: `frontend/src/components/chat-igini.spec.tsx`

**Interfaces:**
- Consumes: `POST /chat/messages`, `GET /chat/messages` (Task 9), `useAuth()` (`frontend/src/lib/auth.tsx`), `request()`/`ApiError`/`JAMAIS_EN_FILE` (pre-existing internals of `frontend/src/lib/api.ts`).
- Produces:
  ```ts
  export interface ChatMessage { id: string; role: 'user' | 'igini'; content: string; created_at: string }
  api.chatHistory(token: string): Promise<ChatMessage[]>
  api.sendChatMessage(token: string, content: string): Promise<ChatMessage>
  ```
  and `export function ChatIgini({ onClose }: { onClose: () => void }): JSX.Element`, rendering each message's **raw** `content` for now (Task 11 adds marker parsing on top). Consumed by Task 11 (extends this same file) and Task 12 (`Systeme`).

- [ ] **Step 1: Add the `ChatMessage` type to `api.ts`**

In `frontend/src/lib/api.ts`, right after the `Memory` interface (after its closing `}` on line 555, before `export interface Concept {`), add:

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'igini';
  content: string;
  created_at: string;
}
```

- [ ] **Step 2: Add the chat functions to the `api` object**

In `frontend/src/lib/api.ts`, right after `recallMemories` (before `createConcept`), add:

```ts
  chatHistory: (token: string) =>
    request<ChatMessage[]>('/chat/messages', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  sendChatMessage: (token: string, content: string) =>
    request<ChatMessage>('/chat/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    }),
```

- [ ] **Step 3: Add `/chat/messages` to `JAMAIS_EN_FILE`**

In `frontend/src/lib/api.ts`, in the `JAMAIS_EN_FILE` array, add `'/chat/messages'`:

```ts
const JAMAIS_EN_FILE = [
  '/auth/login',
  '/auth/me/password',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/users/signup',
  // Un message de chat hors ligne n'a pas de sens à rejouer plus tard : la
  // conversation aura avancé, et la réponse arriverait hors contexte. Même
  // raisonnement pour la lecture de l'historique : elle échoue tout de
  // suite plutôt que de servir un fil de discussion périmé sans le dire.
  '/chat/messages',
];
```

- [ ] **Step 4: Write the failing component tests**

Create `frontend/src/components/chat-igini.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { mockApiRoutes, signInAs } from '@/test-utils/mocks';
import { ChatIgini } from './chat-igini';

function afficher(onClose = vi.fn()) {
  return render(
    <AuthProvider>
      <ChatIgini onClose={onClose} />
    </AuthProvider>,
  );
}

describe('ChatIgini', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('tok123', { id: 'u1', email: 'fictif@ignitux.test' });
  });

  it('charge et affiche l’historique existant', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [{ id: 'm1', role: 'user', content: 'Salut', created_at: '2026-01-01T00:00:00Z' }],
      },
    });

    afficher();

    expect(await screen.findByText('Salut')).toBeInTheDocument();
  });

  it('envoie un message et affiche la réponse d’Igini', async () => {
    mockApiRoutes({
      'GET /chat/messages': { status: 200, body: [] },
      'POST /chat/messages': {
        status: 201,
        body: { id: 'm2', role: 'igini', content: 'Bonjour !', created_at: '2026-01-01T00:00:01Z' },
      },
    });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut Igini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Salut Igini')).toBeInTheDocument();
    expect(await screen.findByText('Bonjour !')).toBeInTheDocument();
  });

  it("n'envoie rien pour un message vide ou blanc", async () => {
    mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });

  it("affiche l'erreur du serveur si l'envoi échoue (ex. plafond de coût atteint)", async () => {
    mockApiRoutes({
      'GET /chat/messages': { status: 200, body: [] },
      'POST /chat/messages': { status: 402, body: { message: 'Plafond atteint.' } },
    });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Plafond atteint.')).toBeInTheDocument();
  });

  it("échoue tout de suite hors-ligne, sans mise en file d'attente", async () => {
    mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });

    afficher();
    fireEvent.change(await screen.findByLabelText('Ton message'), { target: { value: 'Salut' } });
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText(/pas de réseau/i)).toBeInTheDocument();
  });

  it('ferme le panneau au clic sur le bouton fermer', async () => {
    const onClose = vi.fn();
    mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });

    afficher(onClose);
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer le chat' }));

    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/chat-igini.spec.tsx`
Expected: FAIL — `./chat-igini` doesn't exist yet.

- [ ] **Step 6: Implement the component**

Create `frontend/src/components/chat-igini.tsx`:

```tsx
'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function ChatIgini({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [brouillon, setBrouillon] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api
      .chatHistory(token)
      .then(setMessages)
      .catch(() => setErreur('Impossible de charger la conversation.'));
  }, [token]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    const contenu = brouillon.trim();
    if (!token || !contenu || envoiEnCours) return;

    setBrouillon('');
    setErreur(null);
    setEnvoiEnCours(true);
    setMessages((precedents) => [
      ...precedents,
      { id: `temp-${Date.now()}`, role: 'user', content: contenu, created_at: new Date().toISOString() },
    ]);

    try {
      const reponse = await api.sendChatMessage(token, contenu);
      setMessages((precedents) => [...precedents, reponse]);
    } catch (error) {
      setErreur(error instanceof ApiError ? error.message : 'Impossible de contacter Igini.');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="panneau-chat-igini" role="dialog" aria-label="Discuter avec Igini">
      <header className="panneau-chat-igini__entete">
        <span>Igini</span>
        <button type="button" onClick={onClose} aria-label="Fermer le chat">
          ✕
        </button>
      </header>

      <div className="panneau-chat-igini__messages">
        {messages.map((message) => (
          <p
            key={message.id}
            className={`panneau-chat-igini__message panneau-chat-igini__message--${message.role}`}
          >
            {message.content}
          </p>
        ))}
        <div ref={finRef} />
      </div>

      {erreur && <p className="panneau-chat-igini__erreur">{erreur}</p>}

      <form className="panneau-chat-igini__saisie" onSubmit={envoyer}>
        <input
          type="text"
          value={brouillon}
          onChange={(event) => setBrouillon(event.target.value)}
          placeholder="Écris à Igini…"
          aria-label="Ton message"
          disabled={envoiEnCours}
        />
        <button type="submit" className="primary" disabled={envoiEnCours || !brouillon.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `cd frontend && npx vitest run src/components/chat-igini.spec.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/chat-igini.tsx frontend/src/components/chat-igini.spec.tsx
git commit -m "feat(chat): ajouter le composant ChatIgini de base et le client API"
```

---

## Task 11: Frontend markers — "Enregistrer ce souvenir" and project link

**Files:**
- Modify: `frontend/src/components/chat-igini.tsx`
- Modify: `frontend/src/components/chat-igini.spec.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: `api.createMemory` (pre-existing, widened here — see Step 1), Task 10's `ChatIgini` base rendering.
- Produces: `extraireMarqueurs(contenu: string): { texte: string; projetId: string | null; souvenirSuggere: string | null }` (exported from `chat-igini.tsx` for direct unit testing), plus the two UI affordances.

**Marker format**, emitted by the system prompt written in Task 8 (`chat.service.ts`): a message may end with `[[projet: <id>]]` and/or `[[souvenir: <contenu>]]`, each on its own line. Neither string must ever reach the visible bubble text.

- [ ] **Step 1: Widen `api.createMemory` to accept an optional `projectId`**

In `frontend/src/lib/api.ts`, change:

```ts
  createMemory: (
    token: string,
    projectId: string,
    category: MemoryCategory,
    content: string,
    tags: string[] = [],
  ) =>
    request<Memory>('/memory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, category, content, tags }),
    }),
```

to:

```ts
  createMemory: (
    token: string,
    projectId: string | undefined,
    category: MemoryCategory,
    content: string,
    tags: string[] = [],
  ) =>
    request<Memory>('/memory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, category, content, tags }),
    }),
```

The backend DTO (`CreateMemoryDto.projectId`) is already `@IsOptional()`; every existing call site keeps passing a real string, which still satisfies `string | undefined`.

- [ ] **Step 2: Write the failing tests for marker extraction and the two UI affordances**

In `frontend/src/components/chat-igini.spec.tsx`, add the import:

```ts
import { extraireMarqueurs } from './chat-igini';
```

(alongside the existing `import { ChatIgini } from './chat-igini';`)

Then add:

```tsx
describe('extraireMarqueurs', () => {
  it('ne modifie pas un texte sans marqueur', () => {
    expect(extraireMarqueurs('Bonjour, comment puis-je aider ?')).toEqual({
      texte: 'Bonjour, comment puis-je aider ?',
      projetId: null,
      souvenirSuggere: null,
    });
  });

  it('extrait le marqueur projet et le retire du texte affiché', () => {
    expect(extraireMarqueurs("J'ai lancé l'analyse : faisabilité 7/10.\n[[projet: p1]]")).toEqual({
      texte: "J'ai lancé l'analyse : faisabilité 7/10.",
      projetId: 'p1',
      souvenirSuggere: null,
    });
  });

  it('extrait le marqueur souvenir et le retire du texte affiché', () => {
    expect(extraireMarqueurs('Je retiens que le local fait 80 m².\n[[souvenir: Le local fait 80 m²]]')).toEqual({
      texte: 'Je retiens que le local fait 80 m².',
      projetId: null,
      souvenirSuggere: 'Le local fait 80 m²',
    });
  });

  it('extrait les deux marqueurs quand ils sont tous les deux présents', () => {
    expect(
      extraireMarqueurs('Fait.\n[[projet: p1]]\n[[souvenir: Contenu]]'),
    ).toEqual({ texte: 'Fait.', projetId: 'p1', souvenirSuggere: 'Contenu' });
  });
});

describe('ChatIgini — marqueurs', () => {
  it('affiche un lien vers le projet sans jamais montrer le marqueur brut', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          {
            id: 'm1',
            role: 'igini',
            content: "J'ai lancé l'analyse.\n[[projet: p1]]",
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });

    afficher();

    expect(await screen.findByText("J'ai lancé l'analyse.")).toBeInTheDocument();
    expect(screen.queryByText(/\[\[projet/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir le projet/i })).toHaveAttribute('href', '/projects/p1');
  });

  it('affiche un bouton "Enregistrer ce souvenir" sans jamais montrer le marqueur brut', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          {
            id: 'm1',
            role: 'igini',
            content: 'Je retiens que le local fait 80 m² — je l’enregistre ?\n[[souvenir: Le local fait 80 m²]]',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });

    afficher();

    expect(await screen.findByText('Je retiens que le local fait 80 m² — je l’enregistre ?')).toBeInTheDocument();
    expect(screen.queryByText(/\[\[souvenir/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer ce souvenir' })).toBeInTheDocument();
  });

  it('enregistre le souvenir suggéré au clic, avec la catégorie fact par défaut', async () => {
    mockApiRoutes({
      'GET /chat/messages': {
        status: 200,
        body: [
          {
            id: 'm1',
            role: 'igini',
            content: 'Je retiens ceci.\n[[souvenir: Contenu suggéré]]',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      'POST /memory': { status: 201, body: { id: 'mem1' } },
    });

    afficher();
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer ce souvenir' }));

    expect(await screen.findByText('Souvenir enregistré.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/chat-igini.spec.tsx`
Expected: FAIL — `extraireMarqueurs` doesn't exist, no link/button rendered yet.

- [ ] **Step 4: Implement marker extraction and the two affordances**

In `frontend/src/components/chat-igini.tsx`, add near the top (after the imports):

```ts
const PROJET_MARKER = /\n?\[\[projet:\s*([^\]]+)\]\]\s*$/;
const SOUVENIR_MARKER = /\n?\[\[souvenir:\s*([^\]]+)\]\]\s*$/;

export function extraireMarqueurs(contenu: string): {
  texte: string;
  projetId: string | null;
  souvenirSuggere: string | null;
} {
  let texte = contenu;
  let projetId: string | null = null;
  let souvenirSuggere: string | null = null;

  const matchProjet = texte.match(PROJET_MARKER);
  if (matchProjet) {
    projetId = matchProjet[1].trim();
    texte = texte.slice(0, matchProjet.index).trimEnd();
  }

  const matchSouvenir = texte.match(SOUVENIR_MARKER);
  if (matchSouvenir) {
    souvenirSuggere = matchSouvenir[1].trim();
    texte = texte.slice(0, matchSouvenir.index).trimEnd();
  }

  return { texte, projetId, souvenirSuggere };
}
```

Then add the import for `Link` and `useState` for the per-message "saved" state, change the top imports from:

```tsx
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
```

to:

```tsx
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
```

Replace the message-rendering block:

```tsx
      <div className="panneau-chat-igini__messages">
        {messages.map((message) => (
          <p
            key={message.id}
            className={`panneau-chat-igini__message panneau-chat-igini__message--${message.role}`}
          >
            {message.content}
          </p>
        ))}
        <div ref={finRef} />
      </div>
```

with:

```tsx
      <div className="panneau-chat-igini__messages">
        {messages.map((message) => (
          <MessageIgini key={message.id} message={message} token={token} />
        ))}
        <div ref={finRef} />
      </div>
```

Then add the `MessageIgini` component, right after the `ChatIgini` function's closing `}`:

```tsx
function MessageIgini({ message, token }: { message: ChatMessage; token: string | null }) {
  const { texte, projetId, souvenirSuggere } = extraireMarqueurs(message.content);
  const [souvenirEnregistre, setSouvenirEnregistre] = useState(false);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);

  async function enregistrerSouvenir() {
    if (!token || !souvenirSuggere || enregistrementEnCours) return;
    setEnregistrementEnCours(true);
    try {
      await api.createMemory(token, undefined, 'fact', souvenirSuggere);
      setSouvenirEnregistre(true);
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  return (
    <div className={`panneau-chat-igini__message panneau-chat-igini__message--${message.role}`}>
      <p style={{ margin: 0 }}>{texte}</p>
      {projetId && (
        <Link href={`/projects/${projetId}`} className="panneau-chat-igini__action">
          Voir le projet →
        </Link>
      )}
      {souvenirSuggere && !souvenirEnregistre && (
        <button
          type="button"
          className="panneau-chat-igini__action"
          onClick={enregistrerSouvenir}
          disabled={enregistrementEnCours}
        >
          Enregistrer ce souvenir
        </button>
      )}
      {souvenirEnregistre && <p className="panneau-chat-igini__confirmation">Souvenir enregistré.</p>}
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npx vitest run src/components/chat-igini.spec.tsx`
Expected: PASS, including the Task 10 tests (unchanged).

- [ ] **Step 6: Add the small CSS for the new affordances**

In `frontend/src/app/globals.css`, add near the `.panneau-chat-igini__message` rules added in Task 12:

```css
.panneau-chat-igini__action {
  display: inline-block;
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: var(--accent);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}

.panneau-chat-igini__confirmation {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

(This step touches the same CSS file as Task 12's Step 4 — whichever task runs second in practice should confirm the earlier rules are still present rather than overwritten.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat-igini.tsx frontend/src/components/chat-igini.spec.tsx frontend/src/lib/api.ts frontend/src/app/globals.css
git commit -m "feat(chat): ajouter le bouton Enregistrer ce souvenir et le lien vers le projet"
```

---

## Task 12: Mount the icon + panel in `Systeme`

**Files:**
- Modify: `frontend/src/components/systeme.tsx`
- Modify: `frontend/src/components/systeme.spec.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: `ChatIgini` (Tasks 10 and 11).
- Produces: the chat icon/panel visible under the same condition as the taskbar (`connecte && (app || surBureau)`).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/systeme.spec.tsx`, add the `mockApiRoutes` import:

```ts
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
```

(replacing the current `import { createRouterMock, signInAs } from '@/test-utils/mocks';`)

Then, inside the `describe('connecté', ...)` block, add:

```ts
    it('affiche l’icône de chat quand la barre des tâches est visible', async () => {
      afficher();
      expect(await screen.findByRole('button', { name: 'Discuter avec Igini' })).toBeInTheDocument();
    });

    it('ouvre le panneau de chat au clic sur l’icône, et referme l’icône', async () => {
      mockApiRoutes({ 'GET /chat/messages': { status: 200, body: [] } });
      afficher();

      fireEvent.click(await screen.findByRole('button', { name: 'Discuter avec Igini' }));

      expect(await screen.findByRole('dialog', { name: 'Discuter avec Igini' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Discuter avec Igini' })).not.toBeInTheDocument();
    });
```

And in the top-level `describe('Systeme', ...)` block (outside `'connecté'`, alongside the "ne montre aucune barre sans connexion" test), add:

```ts
  it("n'affiche pas l’icône de chat sans connexion", () => {
    afficher();
    expect(screen.queryByRole('button', { name: 'Discuter avec Igini' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/systeme.spec.tsx`
Expected: FAIL — no such button/dialog exists yet.

- [ ] **Step 3: Mount the icon and panel in `systeme.tsx`**

In `frontend/src/components/systeme.tsx`, add the import:

```ts
import { ChatIgini } from './chat-igini';
```

Add local state, right after the existing `const [taches, setTaches] = useState<Tache[]>([]);`:

```ts
  const [chatOuvert, setChatOuvert] = useState(false);
```

Then, in the returned JSX, right after the closing `</nav>` of `barre-taches` and before the final `</>`, add:

```tsx
      {!chatOuvert && (
        <button
          type="button"
          className="bouton-chat-igini"
          onClick={() => setChatOuvert(true)}
          aria-label="Discuter avec Igini"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 3h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-4 4v-4H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          </svg>
        </button>
      )}

      {chatOuvert && <ChatIgini onClose={() => setChatOuvert(false)} />}
```

- [ ] **Step 4: Add the CSS**

In `frontend/src/app/globals.css`, right after the `.barre-taches` media-query block (after the closing `}` that follows `.barre-taches__item { padding: 0 0.6rem; }`), add:

```css
.bouton-chat-igini {
  position: fixed;
  right: calc(env(safe-area-inset-right, 0px) + 1rem);
  bottom: calc(4rem + env(safe-area-inset-bottom, 0px) + 1rem);
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: none;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
}

.bouton-chat-igini:hover {
  background: var(--accent-hover);
}

.panneau-chat-igini {
  position: fixed;
  right: calc(env(safe-area-inset-right, 0px) + 1rem);
  bottom: calc(4rem + env(safe-area-inset-bottom, 0px) + 1rem);
  z-index: 25;
  display: flex;
  flex-direction: column;
  width: min(22rem, calc(100vw - 2rem));
  height: min(28rem, calc(100vh - 8rem));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.panneau-chat-igini__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}

.panneau-chat-igini__entete button {
  background: none;
  border: none;
  color: var(--text-muted);
}

.panneau-chat-igini__messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panneau-chat-igini__message {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-sm);
  max-width: 85%;
  white-space: pre-wrap;
}

.panneau-chat-igini__message--user {
  align-self: flex-end;
  background: var(--accent-soft);
  color: var(--text);
}

.panneau-chat-igini__message--igini {
  align-self: flex-start;
  background: var(--surface-3);
  color: var(--text);
}

.panneau-chat-igini__erreur {
  margin: 0;
  padding: 0.5rem 0.8rem;
  color: var(--danger);
  font-size: 0.85rem;
}

.panneau-chat-igini__saisie {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem;
  border-top: 1px solid var(--border);
}

.panneau-chat-igini__saisie input {
  flex: 1;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npx vitest run src/components/systeme.spec.tsx`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/systeme.tsx frontend/src/components/systeme.spec.tsx frontend/src/app/globals.css
git commit -m "feat(chat): monter l'icone et le panneau de chat dans Systeme"
```

---

## Task 13: Real-AI validation — the confirmation rule can't be unit-tested

**Files:**
- Modify: `scripts/validation-reelle.mjs`

**Interfaces:**
- Consumes: `/chat/messages` (Task 9), `/igini/status` (pre-existing, already used by this script's "Générateurs" section), `/igini/usage/mois-en-cours` (pre-existing).
- Produces: a new `--avec-ia`-gated section proving, against a real Claude call, that the orchestrator (a) never triggers a generator on a vague remark, and (b) does trigger one on an explicit request.

Unit tests can prove the *code* never executes a tool on the last turn, or that a `ForbiddenException` becomes a `tool_result`. They cannot prove the *model* actually follows "don't call a generator tool unless asked" — that's a judgment about natural language, only provable against the real API.

- [ ] **Step 1: Add the new section**

In `scripts/validation-reelle.mjs`, add this new section right after the existing `// ── 8. Générateurs ─────...` block's closing `}` (i.e. after the `if (!iaAllumee) { ... } else { ... }` block ends, still before `// ── 9. Le partage d'un projet ...`):

```js
// ── 8bis. Chat orchestré : la règle de confirmation tient-elle ? ───────────
//
// Un jugement de langage naturel, jamais un fait de code : les tests
// unitaires prouvent que le code n'exécute jamais un outil sur le dernier
// tour, pas que le modèle s'abstient réellement d'appeler un générateur
// quand la personne n'a rien demandé. Coûte deux appels réels (un
// orchestrateur économique, pas claude-opus-5).

titre('Chat orchestré');

if (!iaAllumee) {
  noter('ignore', 'Le chat ne déclenche rien sur une remarque vague', 'générateurs éteints');
  noter('ignore', 'Le chat déclenche bien un générateur sur demande explicite', 'générateurs éteints');
} else if (!AVEC_IA) {
  noter(
    'ignore',
    'Chat orchestré : règle de confirmation',
    'non lancée : ajouter --avec-ia (consomme du budget)',
  );
} else {
  let avantAppels = null;
  await verifier('Le nombre d’appels IA du mois est lisible avant le chat', async () => {
    const { corps } = await appel('/igini/usage/mois-en-cours');
    avantAppels = corps?.appels ?? null;
    return `appels ce mois-ci : ${avantAppels}`;
  });

  await verifier('Une remarque vague ne déclenche aucun générateur', async () => {
    const { statut, corps } = await appel('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'Je me demande ce que je devrais faire de mon projet.' }),
    });
    if (statut !== 201) throw new Error(`HTTP ${statut}`);
    if (!corps?.content) throw new Error('réponse sans contenu');
    const { corps: usage } = await appel('/igini/usage/historique');
    const generateursDeclenches = (usage?.appels ?? []).filter((a) =>
      ['analyser', 'construire', 'financer', 'developper', 'transmettre'].includes(a.generateur),
    );
    if (generateursDeclenches.length > 0) {
      throw new Error(`un générateur a tourné sans demande : ${generateursDeclenches[0].generateur}`);
    }
    return `réponse reçue, aucun générateur déclenché (${corps.content.length} caractères)`;
  });

  await verifier('Une demande explicite déclenche bien le bon générateur', async () => {
    if (!projetId) throw new Error('aucun projet');
    const { statut, corps } = await appel('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        content: `Lance une analyse pour le projet dont l'identifiant est ${projetId}.`,
      }),
    });
    if (statut !== 201) throw new Error(`HTTP ${statut}`);
    const { corps: usage } = await appel('/igini/usage/historique');
    const dernier = (usage?.appels ?? [])[0];
    if (dernier?.generateur !== 'analyser') {
      throw new Error(`attendu un appel 'analyser', dernier appel : ${dernier?.generateur ?? 'aucun'}`);
    }
    return `analyse déclenchée, réponse : « ${String(corps?.content ?? '').slice(0, 60)}… »`;
  });
}
```

- [ ] **Step 2: Run the script against a running local server, with AI enabled, and `--avec-ia`**

Run: `node scripts/validation-reelle.mjs --avec-ia` (backend running locally, `IGINI_AI_ENABLED` unset/true, a valid Anthropic credential configured)
Expected: the new "Chat orchestré" section reports `OK` on all 3 lines. This step is manual verification, not part of the automated `npm test` suites — the script itself has no test framework, it *is* the test (see its own header comment).

- [ ] **Step 3: Commit**

```bash
git add scripts/validation-reelle.mjs
git commit -m "test(chat): ajouter la validation reelle de la regle de confirmation (--avec-ia)"
```

---

## Manual verification (local only — no deployment)

After all 13 tasks are merged, run both dev servers locally (per the project's established local-only testing convention) and confirm by hand:
1. Log in, and confirm the chat icon appears on the bureau and inside an application, but never on `/login` or the public landing page `/`.
2. Ask Igini something unrelated to any tool ("comment tu vas ?") — confirm a plain conversational reply, no tool involved.
3. Ask Igini to list your projects, then ask it to analyze one by name — confirm it resolves the name via `lister_projets` and actually triggers the analysis (a real `analyses` row appears on the project page), and that the chat bubble ends with a "Voir le projet →" link.
4. Ask something that would need memory it doesn't have yet, mention a fact, and confirm the "Enregistrer ce souvenir" button appears and actually saves via `/memory` (visible afterwards in the project's Mémoire section, or personal memories if asked with no project in mind).
5. Set `IGINI_AI_ENABLED=false` in `backend/.env` and confirm the chat surfaces the "volontairement éteint" message instead of a generic error.
6. Exhaust the Découverte plan's analysis quota (3/month) from the chat by asking for repeated analyses, and confirm Igini explains the refusal conversationally instead of showing a raw error.
