# Chat avec Igini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent chat icon (visible everywhere in the app once logged in) that opens a free-form conversation with Igini, backed by a new backend endpoint and a per-user message history in Postgres.

**Architecture:** A new `chat_messages` Prisma table (one row per message, one continuous thread per user) is served by a new `backend/src/igini/chat/` module. It calls a new `ClaudeService.generateChatReply()` method — plain-text, not the Zod-structured-output path the 5 generators use — protected only by the existing global AI cost cap (`AiUsageService.assertWithinQuota()`), deliberately bypassing the per-offer quota system (`OffresService.exiger()`). The frontend adds a floating button + panel inside the always-mounted `Systeme` shell, so it appears on every authenticated screen without touching individual pages.

**Tech Stack:** NestJS + Prisma (backend), Next.js/React (frontend), Vitest (`vi.fn`/`vi.mock`, not Jest) on both sides, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-09-27-chat-igini-design.md`

## Global Constraints

- The chat path never calls `OffresService.exiger()` — protected only by `AiUsageService.assertWithinQuota()` (the existing global per-user cost cap). This is load-bearing; a task that adds an `exiger()` call for chat contradicts the approved design.
- One continuous message thread per user — no "conversations" table, no multiple named threads (v1).
- No project context is injected automatically; `projectId` is always `null` for chat's `ai_usage_events` rows.
- No streaming — wait for the full reply, same latency model as the 5 generators.
- Chat is never reachable when logged out (no anonymous access, never shown on `/login`, `/signup`, or the public landing page `/`).
- All user-facing strings are in French, matching the rest of Ignitux.
- Reuse `CLAUDE_MODEL` (`claude-opus-5`) — no new model, no new third-party dependency.
- Schema changes go through `npx prisma db push` against the dev database (this repo has no `prisma/migrations` folder — schema drift is pushed directly, same convention already used for `user_applications`), never a public/production database.

## Review Focus

- **Two consecutive `user`-role messages in history** (previous turn's Claude call failed after the user's message was already persisted) sent to the Claude API, which requires strict `user`/`assistant` alternation and would reject the request — covered by Task 4's `toClaudeMessages` merge logic and its dedicated tests.
- **Empty or whitespace-only message submitted** — the send button must stay inert; nothing should be POSTed — covered by Task 7's `!brouillon.trim()` guard.
- **Global AI cost cap already exhausted mid-conversation** — the chat must surface the server's real error message, not crash or show a generic failure — covered by Task 3 (quota test) and Task 7 (error display test).
- **Chat icon/panel rendered while logged out or on a non-app screen** (login, signup, landing) — must never appear — covered by Task 8's guard tests, reusing `Systeme`'s existing `connecte && (app || surBureau)` condition.
- **Sending a message while offline** — must fail immediately with a clear message, never silently queued and replayed later out of context (the conversation would have moved on) — covered by Task 7 adding `/chat/messages` to `JAMAIS_EN_FILE` and a dedicated offline test.

---

## Task 1: Prisma schema — `chat_messages` table

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `chat_messages { id, user_id, role, content, created_at }`, relation `users.chat_messages`. Consumed by Task 5 (`ChatService`) via `PrismaService`.

This task has no application logic to unit-test — it's schema + a database push, verified by successfully generating the Prisma Client that Task 5's tests type-check against.

- [ ] **Step 1: Add the `chat_messages` model to the schema**

In `backend/prisma/schema.prisma`, insert this new model directly after the `memories` model (right before the `concepts` model's doc comment):

```prisma
/// This model contains row level security and requires additional setup for migrations. Visit https://pris.ly/d/row-level-security for more info.
/// CHAT — un message échangé librement avec Igini, en dehors des 5
/// générateurs structurés. Un seul fil continu par utilisateur : le rôle
/// (`role`) porte la distinction entre ce que la personne a écrit et ce
/// qu'Igini a répondu, sans provenance à documenter en plus (contrairement
/// aux plans générés, qui peuvent en théorie être saisis à la main).
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

This realigns the column spacing to match the rest of the file (Prisma's formatter, not a manual job).

- [ ] **Step 4: Push the schema to the dev database and regenerate the client**

Run: `cd backend && npx prisma db push`

Expected: reports the new `chat_messages` table created, and regenerates `backend/src/generated/prisma/*` (this repo commits the generated client — confirm `git status` shows changes under `backend/src/generated/prisma/`).

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
- Modify: `backend/src/igini/usage/ai-usage.service.ts:40-43` (the `GenerationAttribution` interface)
- Modify: `backend/src/igini/usage/ai-usage.service.spec.ts`
- Modify: `backend/src/igini/claude/generators-availability.ts`
- Modify: `backend/src/igini/claude/generators-availability.spec.ts`

**Interfaces:**
- Produces: `GENERATOR_NAMES` includes `'discuter'`; `GeneratorName` union includes `'discuter'`; `GenerationAttribution.projectId: string | null`; `GENERATORS_DISABLED_MESSAGE` mentions the chat.
- Consumed by: Task 3 (`ClaudeService.generateChatReply`) and Task 5 (`ChatService`).

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
 * `discuter` (le chat libre avec Igini) est ici pour la même raison de
 * traçabilité des coûts que les 5 générateurs, mais suit une règle
 * différente : aucun appel ne passe par `OffresService.exiger()` pour lui
 * (voir `ClaudeService.generateChatReply`) — seul le plafond de coût
 * global le protège. Sa présence ici sert uniquement le journal et les
 * totaux, pas le système d'offres.
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
Expected: PASS unchanged — `offre('entrepreneur').capacites.generateurs` and `offre('construction').capacites.generateurs` are built as `[...GENERATOR_NAMES]`, so they'll now include `'discuter'` too, but the test compares against the same `GENERATOR_NAMES`/`GENERATEURS` constant, so it stays in sync automatically. This inclusion has no runtime effect: `generateChatReply()` (Task 3) never calls `OffresService.exiger()`, so this list is never consulted for chat.

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
   * `null` pour un appel non rattaché à un projet — le chat libre avec
   * Igini (voir `ClaudeService.generateChatReply`). Les 5 générateurs
   * restent tous rattachés à un projet et continuent de passer une chaîne
   * non nulle ; la colonne `ai_usage_events.project_id` est déjà nullable
   * en base, seul ce type l'était encore.
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
Expected: PASS (including the pre-existing test that checks the 5 generator names are still named — unaffected).

- [ ] **Step 14: Commit**

```bash
git add backend/src/igini/usage/generator-names.ts backend/src/igini/usage/generator-names.spec.ts backend/src/igini/usage/ai-usage.service.ts backend/src/igini/usage/ai-usage.service.spec.ts backend/src/igini/claude/generators-availability.ts backend/src/igini/claude/generators-availability.spec.ts
git commit -m "feat(chat): preparer generator-names et ai-usage pour le chat (discuter, projectId nullable)"
```

---

## Task 3: `ClaudeService.generateChatReply()`

**Files:**
- Modify: `backend/src/igini/claude/claude.service.ts`
- Modify: `backend/src/igini/claude/claude.service.spec.ts`

**Interfaces:**
- Consumes: `AiUsageContext` (from Task 2, `projectId: string | null`), `this.availability()`, `this.aiUsage.assertWithinQuota()`, `this.aiUsage.record()`, `this.toSafeMessage()` (all pre-existing private/public members of `ClaudeService`).
- Produces: `ClaudeService.generateChatReply(request: ChatReplyRequest): Promise<string>` where
  ```ts
  export interface ChatReplyRequest {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    usage: AiUsageContext;
  }
  ```
  Consumed by Task 5 (`ChatService.sendMessage`).

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

- [ ] **Step 2: Write the failing tests for `generateChatReply`**

At the end of the `describe('ClaudeService', ...)` block in `claude.service.spec.ts` (just before its closing `});`), add:

```ts
  describe('generateChatReply', () => {
    const CHAT_ATTRIBUTION = { userId: 'u1', projectId: null, generator: 'discuter' } as const;

    const demanderUneReponse = () =>
      service.generateChatReply({
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'Salut Igini' }],
        usage: CHAT_ATTRIBUTION,
      });

    it("n'envoie AUCUNE requête quand les générateurs sont éteints", async () => {
      env.current = { IGINI_AI_ENABLED: 'false' };

      await expect(demanderUneReponse()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it("n'appelle jamais offres.exiger — le chat reste hors du système d'offres", async () => {
      createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Salut !' }], usage: UTILISATION });

      await demanderUneReponse();

      expect(offres.exiger).not.toHaveBeenCalled();
    });

    it('refuse avant tout appel réseau quand le plafond de coût global est atteint', async () => {
      aiUsage.assertWithinQuota.mockRejectedValue(
        new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED),
      );

      await expect(demanderUneReponse()).rejects.toBeInstanceOf(HttpException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('renvoie le texte de la réponse et journalise projectId: null', async () => {
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: 'Salut, comment puis-je aider ?' }],
        usage: UTILISATION,
      });

      const result = await demanderUneReponse();

      expect(result).toBe('Salut, comment puis-je aider ?');
      expect(aiUsage.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: CHAT_ATTRIBUTION, model: CLAUDE_MODEL }),
      );
    });

    it('concatène plusieurs blocs de texte et ignore les blocs non textuels', async () => {
      createMock.mockResolvedValue({
        content: [
          { type: 'text', text: 'Première partie.' },
          { type: 'thinking', thinking: 'raisonnement interne, pas du texte' },
          { type: 'text', text: 'Deuxième partie.' },
        ],
        usage: UTILISATION,
      });

      const result = await demanderUneReponse();

      expect(result).toBe('Première partie.\nDeuxième partie.');
    });

    it("lève une InternalServerErrorException si l'appel Claude échoue", async () => {
      createMock.mockRejectedValue(new Error('network error'));

      await expect(demanderUneReponse()).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
```

- [ ] **Step 3: Import `CLAUDE_MODEL` in the spec file**

In `backend/src/igini/claude/claude.service.spec.ts`, change:

```ts
import { ClaudeService } from './claude.service.js';
```

to:

```ts
import { CLAUDE_MODEL, ClaudeService } from './claude.service.js';
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `cd backend && npx vitest run src/igini/claude/claude.service.spec.ts`
Expected: FAIL — `service.generateChatReply` is not a function.

- [ ] **Step 5: Implement `generateChatReply` in `claude.service.ts`**

In `backend/src/igini/claude/claude.service.ts`, add this interface near `StructuredOutputRequest` (after its closing `}`, before `ClaudeService`'s doc comment):

```ts
export interface ChatReplyMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatReplyRequest {
  systemPrompt: string;
  messages: ChatReplyMessage[];
  /** Attribution du chat : `usage.projectId` vaut toujours `null` (voir `GenerationAttribution`). */
  usage: AiUsageContext;
}
```

Then add this method to the `ClaudeService` class, right after `generateStructuredOutput` (before the closing brace of that method's containing class, i.e. before `private toSafeMessage`):

```ts
  /**
   * Réponse de chat libre : pas de schéma Zod, texte brut. Contrairement à
   * `generateStructuredOutput`, n'appelle jamais `OffresService.exiger()` —
   * le chat reste volontairement hors du système d'offres (voir la spec) et
   * n'est protégé que par le plafond de coût global d'`assertWithinQuota`.
   */
  async generateChatReply(request: ChatReplyRequest): Promise<string> {
    const availability = this.availability();
    if (!availability.enabled) {
      throw new ServiceUnavailableException(availability.reason);
    }

    await this.aiUsage.assertWithinQuota(request.usage.userId);

    const startedAt = Date.now();

    try {
      const response = await this.getClient().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: request.systemPrompt,
        messages: request.messages,
      });

      await this.aiUsage
        .record({
          context: request.usage,
          model: CLAUDE_MODEL,
          usage: response.usage,
          durationMs: Date.now() - startedAt,
        })
        .catch((error: unknown) => {
          this.logger.error(
            'Coût IA non journalisé (chat) : la dépense a eu lieu mais manquera aux totaux.',
            error as Error,
          );
        });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (!text) {
        throw new Error('Réponse Claude sans contenu texte (chat).');
      }

      return text;
    } catch (error) {
      this.logger.error('Échec de la génération de la réponse du chat via Claude', error as Error);
      throw new InternalServerErrorException(
        this.toSafeMessage(error, "IGINI n'a pas pu répondre, réessaie dans un instant."),
      );
    }
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/igini/claude/claude.service.spec.ts`
Expected: PASS, all tests including the pre-existing `generateStructuredOutput` ones.

- [ ] **Step 7: Commit**

```bash
git add backend/src/igini/claude/claude.service.ts backend/src/igini/claude/claude.service.spec.ts
git commit -m "feat(chat): ajouter ClaudeService.generateChatReply (texte libre, hors offres)"
```

---

## Task 4: `toClaudeMessages` — strict role alternation helper

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
  Consumed by Task 5 (`ChatService.sendMessage`), and matches Task 3's `ChatReplyMessage` shape.

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

## Task 5: `ChatService`

**Files:**
- Create: `backend/src/igini/chat/chat.service.ts`
- Create: `backend/src/igini/chat/chat.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.chat_messages` (`create`, `findMany`), `ClaudeService.generateChatReply` (Task 3), `toClaudeMessages` (Task 4), `buildSystemPrompt` (`backend/src/igini/claude/igini-identity.ts`, pre-existing).
- Produces:
  ```ts
  export const CHAT_HISTORY_WINDOW = 20;
  class ChatService {
    sendMessage(userId: string, content: string): Promise<{ id: string; role: string; content: string; created_at: Date | null }>;
    history(userId: string, limit?: number): Promise<Array<{ id: string; role: string; content: string; created_at: Date | null }>>;
  }
  ```
  Consumed by Task 6 (`ChatController`).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/igini/chat/chat.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { CHAT_HISTORY_WINDOW, ChatService } from './chat.service.js';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chat_messages: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let claude: { generateChatReply: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = { chat_messages: { create: vi.fn(), findMany: vi.fn() } };
    claude = { generateChatReply: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('sendMessage', () => {
    it('persiste le message utilisateur avant d’appeler Claude, puis persiste la réponse', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create
        .mockResolvedValueOnce({ id: 'm1', role: 'user', content: 'Salut' })
        .mockResolvedValueOnce({ id: 'm2', role: 'igini', content: 'Bonjour !' });
      claude.generateChatReply.mockResolvedValue('Bonjour !');

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
      claude.generateChatReply.mockResolvedValue('Suite');

      await service.sendMessage('u1', 'Nouvelle question');

      expect(claude.generateChatReply).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Question récente' },
            { role: 'assistant', content: 'Réponse récente' },
            { role: 'user', content: 'Nouvelle question' },
          ],
        }),
      );
    });

    it("attribue l'appel au chat, sans projet", async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });
      claude.generateChatReply.mockResolvedValue('ok');

      await service.sendMessage('u1', 'Salut');

      expect(claude.generateChatReply).toHaveBeenCalledWith(
        expect.objectContaining({ usage: { userId: 'u1', projectId: null, generator: 'discuter' } }),
      );
    });

    it('limite la fenêtre au nombre de messages configuré', async () => {
      prisma.chat_messages.findMany.mockResolvedValue([]);
      prisma.chat_messages.create.mockResolvedValue({ id: 'm2', role: 'igini', content: 'ok' });
      claude.generateChatReply.mockResolvedValue('ok');

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

/**
 * Combien de messages passés servent de contexte à un nouvel appel — au-delà,
 * le coût par appel grimpe sans ajouter grand-chose à une conversation.
 */
export const CHAT_HISTORY_WINDOW = 20;

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu n'es pas dans l'une des 5 étapes de ta méthode :
c'est une conversation libre. La personne peut poser une question, réfléchir à voix haute, ou
demander une explication, sans que ça doive produire un plan structuré. Réponds simplement,
directement, dans le ton d'une conversation — pas dans celui d'un rapport.`);

/**
 * CHAT — la conversation libre avec Igini, en dehors des 5 générateurs
 * structurés. Un seul fil continu par utilisateur (voir la spec) :
 * `sendMessage` persiste le tour de la personne avant d'appeler Claude, pour
 * que le message reste visible dans l'historique même si la réponse échoue
 * (plafond atteint, panne réseau...).
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
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

    const reply = await this.claude.generateChatReply({
      systemPrompt: SYSTEM_PROMPT,
      messages: claudeMessages,
      usage: { userId, projectId: null, generator: 'discuter' },
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
git commit -m "feat(chat): ajouter ChatService (sendMessage, history)"
```

---

## Task 6: `ChatController`, DTO, `ChatModule`, and registration

**Files:**
- Create: `backend/src/igini/chat/dto/send-chat-message.dto.ts`
- Create: `backend/src/igini/chat/chat.controller.ts`
- Create: `backend/src/igini/chat/chat.controller.spec.ts`
- Create: `backend/src/igini/chat/chat.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ChatService.sendMessage`/`history` (Task 5), `CurrentUser`/`AuthenticatedUser` (`backend/src/auth/current-user.decorator.ts`), `JwtAuthGuard` (`backend/src/auth/jwt-auth.guard.ts`), `ClaudeModule` (`backend/src/igini/claude/claude.module.ts`), `AuthModule` (`backend/src/auth/auth.module.ts`).
- Produces: `POST /chat/messages`, `GET /chat/messages?limit=`. Consumed by Task 7 (frontend `api.ts`).

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
import { ClaudeModule } from '../claude/claude.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  // Voir MemoryModule pour l'explication de ce couple AuthModule/PassportModule.
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ClaudeModule],
  controllers: [ChatController],
  providers: [ChatService],
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
git commit -m "feat(chat): exposer POST/GET /chat/messages"
```

---

## Task 7: Frontend API client + `ChatIgini` component

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/chat-igini.tsx`
- Create: `frontend/src/components/chat-igini.spec.tsx`

**Interfaces:**
- Consumes: `POST /chat/messages`, `GET /chat/messages` (Task 6), `useAuth()` (`frontend/src/lib/auth.tsx`), `request()`/`ApiError`/`JAMAIS_EN_FILE` (pre-existing internals of `frontend/src/lib/api.ts`).
- Produces:
  ```ts
  export interface ChatMessage { id: string; role: 'user' | 'igini'; content: string; created_at: string }
  api.chatHistory(token: string): Promise<ChatMessage[]>
  api.sendChatMessage(token: string, content: string): Promise<ChatMessage>
  ```
  and `export function ChatIgini({ onClose }: { onClose: () => void }): JSX.Element`. Consumed by Task 8 (`Systeme`).

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
git commit -m "feat(chat): ajouter le composant ChatIgini et le client API"
```

---

## Task 8: Mount the icon + panel in `Systeme`

**Files:**
- Modify: `frontend/src/components/systeme.tsx`
- Modify: `frontend/src/components/systeme.spec.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: `ChatIgini` (Task 7).
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

## Manual verification (local only — no deployment)

After all 8 tasks are merged, run both dev servers locally (per the project's established local-only testing convention) and confirm by hand:
1. Log in, and confirm the chat icon appears on the bureau and inside an application, but never on `/login` or the public landing page `/`.
2. Open the chat, send a message, confirm a reply from Igini appears and the history survives a page refresh (persisted in Postgres).
3. Set `IGINI_AI_ENABLED=false` in `backend/.env` and confirm the chat surfaces the "volontairement éteint" message instead of a generic error.
