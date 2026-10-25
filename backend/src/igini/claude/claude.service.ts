import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { CreditsService, type Reservation } from '../../credits/credits.service.js';
import { AiUsageService, type AiUsageContext, type ClaudeTokenUsage } from '../usage/ai-usage.service.js';
import {
  readGeneratorsAvailability,
  type GeneratorsAvailability,
} from './generators-availability.js';

/**
 * Modèle utilisé par tous les générateurs. Exporté parce que la provenance
 * enregistrée en base doit nommer le modèle réellement appelé : une constante
 * recopiée à la main finirait par mentir le jour où l'on change de modèle ici
 * sans penser aux colonnes generated_model.
 */
export const CLAUDE_MODEL = 'claude-opus-5';

/**
 * Une page réellement visitée par la recherche web — jamais une URL que le
 * modèle prétendrait avoir vue.
 *
 * C'est pour ça qu'aucun générateur ne demande `sources` dans son propre
 * schéma Zod : un champ que le modèle remplirait lui-même serait exactement
 * l'information simulée présentée comme réelle que l'article 10 de la
 * Constitution interdit. Cette liste est reconstruite ici, après coup, à
 * partir des blocs `web_search_tool_result` que l'API renvoie — jamais du
 * texte que le modèle a écrit.
 */
export interface WebSearchSource {
  title: string;
  url: string;
}

/** Cadrage de la recherche web pour un appel donné. */
export interface WebSearchOptions {
  /**
   * Nombre maximal de recherches pour CET appel. Un plafond dur, et une
   * décision de coût, pas un détail technique : chaque recherche facture
   * 0,01 $ en plus des tokens (voir WEB_SEARCH_MICRO_USD_PER_SEARCH dans
   * ai-pricing.ts).
   */
  maxUses: number;
}

/**
 * Une page réellement ouverte par l'outil de lecture — même principe que
 * `WebSearchSource` : reconstruite à partir des blocs `web_fetch_tool_result`
 * renvoyés par l'API, jamais d'une URL que le modèle dirait avoir lue.
 */
export interface PageLue {
  url: string;
  titre: string | null;
  /** Horodatage ISO de la lecture, tel que l'API le donne. */
  luLe: string | null;
}

/**
 * Cadrage de la lecture de pages pour un appel donné.
 *
 * `allowedDomains` n'est pas une option de confort : c'est ce qui empêche le
 * modèle d'aller lire autre chose que la source officielle qu'on lui confie.
 * Pas de frais par lecture côté Anthropic, seulement les tokens de la page —
 * d'où `maxContentTokens`, qui borne ce que coûte une page trop longue.
 */
export interface WebFetchOptions {
  allowedDomains: string[];
  maxUses: number;
  maxContentTokens: number;
}

/**
 * Modèle utilisé par l'orchestrateur du chat (tours de conversation), pas
 * par les générateurs — délibérément plus rapide/économique, puisqu'un
 * tour de conversation ordinaire en enchaîne plusieurs par message envoyé,
 * contrairement à une génération ponctuelle. `CLAUDE_MODEL` reste inchangé
 * et continue de servir les générateurs, appelés directement ou via un
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

export interface StructuredOutputRequest<T> {
  schema: z.ZodType<T>;
  system: string;
  userContent: string;
  /** Message technique loggé côté serveur en cas d'échec. */
  logContext: string;
  /** Message renvoyé au client en cas d'échec. */
  userErrorMessage: string;
  /**
   * Qui paie l'appel, qui l'a lancé, sur quel projet, via quel générateur.
   *
   * **Obligatoire, et c'est le point.** Ce champ n'est pas optionnel pour que
   * TypeScript refuse de compiler un générateur qui ne dirait pas à qui
   * attribuer sa dépense. Le verrou du budget et celui de l'anonymat sont le
   * même verrou : un appel facturé sans propriétaire est un appel qu'aucun
   * solde ne pourra jamais débiter.
   */
  usage: AiUsageContext;
  /**
   * Appelé dès que le prix est réservé, AVANT l'appel réseau, avec la
   * réservation. Pour l'appelant qui enregistre lui-même le résultat : si
   * l'appel réussit mais que le résultat ne peut pas être gardé (statuts
   * retenus entre-temps, évaluation arrivée trop tard…), il rend les crédits
   * avec `CreditsService.rendreResultatNonEnregistre(reservation.id)`. Un
   * échec de l'appel lui-même est déjà rendu ici. Jamais appelé pour un
   * appel offert (rien n'est réservé).
   */
  surReservation?: (reservation: Reservation) => void;
  /**
   * Une seule à la fois par projet et par générateur : si une autre est en
   * cours (débit sans réponse ni remboursement, de moins de 15 minutes), 409
   * « Déjà en cours. » avant tout appel et sans rien débiter. Voir
   * `CreditsService.reserver`.
   */
  exclusif?: boolean;
  /**
   * L'identifiant de l'appel (un UUID), quand l'appelant doit pouvoir
   * retrouver le débit plus tard sans rien stocker de plus : l'évaluation de
   * financement passe son propre identifiant. Unique par appel — la ligne de
   * coût porte cet `id`. Absent : tiré au hasard.
   */
  appelId?: string;
  /**
   * Absent par défaut : les générateurs qui n'en ont pas besoin ne changent
   * pas de comportement, tokens et signature de retour compris. Quand il est
   * fourni, `generateStructuredOutput` renvoie un `sources` en plus — voir
   * les deux signatures ci-dessous.
   */
  webSearch?: WebSearchOptions;
  /**
   * Absent par défaut, comme `webSearch`. Fourni, l'appel peut ouvrir les
   * pages des domaines autorisés et renvoie `pagesLues` en plus.
   */
  webFetch?: WebFetchOptions;
}

/**
 * Combien de fois un tour mis en pause (recherche encore en cours côté
 * serveur) est relancé avant d'abandonner. Anthropic ne documente aucune
 * borne pour `pause_turn` ; au-delà, mieux vaut échouer proprement que
 * relancer indéfiniment un appel déjà facturé plusieurs fois.
 */
const MAX_PAUSE_RESUMPTIONS = 4;

/**
 * Point d'entrée unique vers l'API Claude pour les fonctionnalités IA
 * d'Ignitux (analyse, planification, …). Chaque appelant fournit un schéma
 * Zod et un prompt ; ce service gère le client, le format de sortie
 * structurée, la traduction des erreurs en réponses HTTP propres,
 * l'enregistrement de ce que l'appel a réellement coûté — et le paiement en
 * crédits : réservé avant l'appel, rendu s'il échoue.
 *
 * L'ordre des verrous, avant tout appel réseau :
 * 1. l'interrupteur global (`IGINI_AI_ENABLED`) — 503 ;
 * 2. le garde-fou de coût par compte (anti-abus) — 402 `plafond_securite` ;
 * 3. la réservation des crédits au prix du barème — 402
 *    `credits_insuffisants`. Rien n'a alors été dépensé ni débité.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | undefined;

  constructor(
    private readonly aiUsage: AiUsageService,
    private readonly credits: CreditsService,
  ) {}

  // Instancié à la première utilisation (et pas comme champ de classe) pour
  // que l'absence d'identifiants (ANTHROPIC_API_KEY ou autre mécanisme pris
  // en charge par le SDK) ne fasse pas planter tout le démarrage de Nest,
  // seulement l'appel qui en a besoin.
  private getClient(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  /**
   * État de l'interrupteur des générateurs. Lu à chaque appel plutôt que
   * mémorisé : une valeur figée au démarrage survivrait à un changement de
   * configuration, et c'est exactement le genre d'écart qui finit par faire
   * dépenser du budget qu'on croyait coupé.
   */
  availability(): GeneratorsAvailability {
    return readGeneratorsAvailability(getEnv().IGINI_AI_ENABLED);
  }

  async generateStructuredOutput<T>(
    request: StructuredOutputRequest<T> & { webSearch?: undefined; webFetch?: undefined },
  ): Promise<T>;
  async generateStructuredOutput<T>(
    request: StructuredOutputRequest<T> & { webSearch: WebSearchOptions; webFetch?: undefined },
  ): Promise<T & { sources: WebSearchSource[] }>;
  async generateStructuredOutput<T>(
    request: StructuredOutputRequest<T> & { webSearch?: undefined; webFetch: WebFetchOptions },
  ): Promise<T & { pagesLues: PageLue[] }>;
  async generateStructuredOutput<T>(
    request: StructuredOutputRequest<T>,
  ): Promise<T | (T & { sources: WebSearchSource[] }) | (T & { pagesLues: PageLue[] })> {
    // Le verrou est ici, et pas dans chaque générateur : les six passent
    // par ce point unique, donc aucun d'eux ne peut être oublié le jour où
    // un septième arrive.
    const availability = this.availability();
    if (!availability.enabled) {
      throw new ServiceUnavailableException(availability.reason);
    }

    // Le garde-fou de coût et les crédits, au même endroit et pour la même
    // raison : tous les générateurs passent ici, donc aucun ne peut être
    // oublié.
    //
    // **Avant** l'appel réseau, et **hors** du try. Avant, parce qu'un solde
    // vérifié après la dépense ne borne rien. Hors du try, parce que le catch
    // traduit toute exception en 500 : un « crédits insuffisants » avalé là
    // ressortirait en « erreur interne », et la personne ne saurait pas
    // qu'il lui suffit de recharger.
    await this.aiUsage.assertWithinQuota(request.usage.userId);
    const appelId = request.appelId ?? randomUUID();
    const reservation = await this.reserver(request.usage, appelId, request.exclusif);
    if (reservation) request.surReservation?.(reservation);

    const startedAt = Date.now();

    try {
      const tools: Anthropic.ToolUnion[] | undefined = request.webSearch
        ? [
            {
              type: 'web_search_20260209',
              name: 'web_search',
              max_uses: request.webSearch.maxUses,
            },
          ]
        : request.webFetch
          ? [
              {
                type: 'web_fetch_20260209',
                name: 'web_fetch',
                allowed_domains: request.webFetch.allowedDomains,
                max_uses: request.webFetch.maxUses,
                max_content_tokens: request.webFetch.maxContentTokens,
              },
            ]
          : undefined;

      const baseParams = {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: request.system,
        output_config: { format: zodOutputFormat(request.schema) },
        ...(tools ? { tools } : {}),
      };

      let messages: Anthropic.MessageParam[] = [{ role: 'user', content: request.userContent }];
      let response = await this.getClient().messages.parse({ ...baseParams, messages });
      let usage: ClaudeTokenUsage = response.usage;

      // La recherche web peut prendre plusieurs tours côté serveur : un tour
      // en pause (`pause_turn`) n'a encore produit aucune sortie structurée,
      // seulement une promesse de reprise — la seule façon documentée de
      // continuer est de renvoyer ce tour tel quel. On cumule l'usage de
      // chaque tour : chacun est déjà facturé, et ne retenir que le dernier
      // sous-évaluerait le coût réel de l'appel. La lecture de pages suit la
      // même règle. Sans recherche ni lecture, aucun outil serveur n'est
      // déclaré et ce tour ne peut pas se produire — la boucle ne s'exécute
      // donc pas, et `usage` reste `response.usage` sans transformation.
      if (tools) {
        let resumptions = 0;
        while (response.stop_reason === 'pause_turn' && resumptions < MAX_PAUSE_RESUMPTIONS) {
          messages = [...messages, { role: 'assistant', content: response.content }];
          response = await this.getClient().messages.parse({ ...baseParams, messages });
          usage = addUsage(usage, response.usage);
          resumptions += 1;
        }
      }

      // Journalisé AVANT la vérification du contenu, et l'ordre compte : dès
      // qu'une réponse existe, les tokens sont facturés. Enregistrer après le
      // contrôle ferait disparaître des totaux exactement les appels qui ont
      // mal tourné — les plus coûteux à ignorer, puisqu'ils sont payés sans
      // rien rendre. L'objet `usage` part tel quel : sa lecture appartient au
      // journal, qui la fait sous protection. La réflexion interne y est
      // comprise, facturée au tarif de sortie, et jusqu'ici invisible : c'est
      // le trou que PRICING.md désignait comme le plus important.
      //
      // Le `catch` est une redondance assumée. `record` s'engage déjà à ne
      // jamais échouer vers son appelant, et son propre test le vérifie ; ce
      // filet-ci protège le jour où quelqu'un modifiera cet engagement sans
      // voir qu'une génération de quarante secondes, déjà payée, en dépend.
      // Entre perdre une ligne de comptabilité et perdre le travail de la
      // personne, le choix n'appartient pas au hasard d'une refonte.
      await this.aiUsage
        .record({
          id: appelId,
          context: request.usage,
          model: CLAUDE_MODEL,
          usage,
          durationMs: Date.now() - startedAt,
        })
        .catch((error: unknown) => {
          this.logger.error(
            'Coût IA non journalisé : la dépense a eu lieu mais manquera aux totaux.',
            error as Error,
          );
        });

      if (!response.parsed_output) {
        throw new Error('parsed_output manquant dans la réponse Claude.');
      }

      if (request.webSearch) {
        return { ...response.parsed_output, sources: extractWebSearchSources(response.content) };
      }
      if (request.webFetch) {
        return { ...response.parsed_output, pagesLues: extractPagesLues(messages, response.content) };
      }
      return response.parsed_output;
    } catch (error) {
      this.logger.error(request.logContext, error as Error);
      // Une génération ratée ne coûte rien : le débit réservé est rendu,
      // une seule fois (le service des crédits le garantit).
      await this.rembourser(reservation);
      throw new InternalServerErrorException(this.toSafeMessage(error, request.userErrorMessage));
    }
  }

  /**
   * Réserve le prix de l'appel sur le compte qui paie (`usage.userId`, le
   * propriétaire du projet), en gardant qui l'a lancé (`usage.actorId`).
   * `null` pour un appel offert : rien à réserver, rien à rendre.
   */
  private reserver(usage: AiUsageContext, appelId: string, exclusif?: boolean): Promise<Reservation | null> {
    if (usage.offert) return Promise.resolve(null);
    return this.credits.reserver({
      ownerId: usage.userId,
      actorId: usage.actorId ?? usage.userId,
      generator: usage.generator,
      projectId: usage.projectId,
      appelId,
      ...(exclusif ? { exclusif: true } : {}),
    });
  }

  /**
   * Rend un débit après un échec. N'échoue jamais vers l'appelant : l'erreur
   * à montrer est celle de la génération, pas celle du remboursement — qui
   * est journalisée pour être rattrapée à la main (ajustement admin).
   */
  private async rembourser(reservation: Reservation | null): Promise<void> {
    if (!reservation) return;
    try {
      await this.credits.rembourser(reservation.id);
    } catch (error) {
      this.logger.error(
        `Remboursement impossible du débit ${reservation.id} (${reservation.credits} crédits) : à rendre à la main.`,
        error as Error,
      );
    }
  }

  /**
   * Chat orchestré : jusqu'à `MAX_ORCHESTRATION_TURNS` allers-retours entre
   * Claude et les outils NestJS existants.
   *
   * **Un message = un prix** (`discuter` au barème), réservé avant le
   * premier tour et rendu si la réponse échoue — quel que soit le nombre de
   * tours. Un générateur que le chat déclenche par un outil passe par
   * `generateStructuredOutput` et se paie en plus, à son propre prix, avec
   * son propre remboursement.
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
    const appelId = randomUUID();
    const reservation = await this.reserver(request.usage, appelId);

    try {
      return await this.orchestrer(request, appelId);
    } catch (error) {
      // Pas de réponse, pas de prix : le message est rendu. Un générateur
      // déjà lancé par un outil reste payé — il a réussi, et son résultat
      // est en base.
      await this.rembourser(reservation);
      throw error;
    }
  }

  /** Les tours de conversation d'un message. Le premier porte l'identifiant de l'appel débité. */
  private async orchestrer(request: ConverseWithToolsRequest, appelId: string): Promise<string> {
    let apiMessages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let turn = 0; turn < MAX_ORCHESTRATION_TURNS; turn++) {
      // Sur le dernier tour autorisé, aucun outil n'est offert — Claude ne
      // peut alors que répondre en texte. C'est plus strict que « ne pas
      // exécuter un tool_use sur le dernier tour » : sans cette mesure, un
      // générateur déclenché sur l'avant-dernier tour pouvait rester
      // silencieux si le tour suivant tentait un nouvel outil, puisque
      // celui-ci retombait alors sur le message de repli sans jamais
      // mentionner ce qui avait réellement tourné (et été payé) avant.
      // En forçant une réponse texte ici, IGINI doit résumer tout ce qui a
      // été fait dans les tours précédents plutôt que de tenter un outil de
      // plus qu'on lui refuserait de toute façon.
      const dernierTour = turn === MAX_ORCHESTRATION_TURNS - 1;
      const startedAt = Date.now();
      let response: Anthropic.Message;
      try {
        response = await this.getClient().messages.create({
          model: CLAUDE_ORCHESTRATOR_MODEL,
          max_tokens: 2048,
          system: request.systemPrompt,
          messages: apiMessages,
          ...(dernierTour ? {} : { tools: request.tools }),
        });
      } catch (error) {
        this.logger.error("Échec d'un tour d'orchestration du chat via Claude", error as Error);
        throw new InternalServerErrorException(
          this.toSafeMessage(error, "IGINI n'a pas pu répondre, réessaie dans un instant."),
        );
      }

      await this.aiUsage
        .record({
          ...(turn === 0 ? { id: appelId } : {}),
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

      // Sur le dernier tour, `tools` n'a pas été envoyé : Claude ne devrait
      // matériellement produire aucun bloc `tool_use`. On l'impose quand
      // même explicitement plutôt que de compter dessus — une réponse qui
      // en contiendrait un malgré tout ne doit jamais être exécutée ici,
      // c'est exactement le cas que cette mesure existe pour fermer.
      const toolUseBlocks = dernierTour
        ? []
        : response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        if (text) return text;
        if (dernierTour) return "Je n'ai pas pu terminer cette demande, peux-tu préciser ?";
        throw new InternalServerErrorException("IGINI n'a pas pu répondre, réessaie dans un instant.");
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

  /**
   * Traduit une erreur du SDK Anthropic en message sûr pour le client — assez
   * précis pour être exploitable (distinguer "pas encore configuré" de
   * "surchargé" de "en panne"), sans jamais renvoyer le détail brut de
   * l'erreur (qui pourrait contenir des informations internes).
   */
  private toSafeMessage(error: unknown, fallback: string): string {
    // Deux cas distincts mènent au même message pour l'appelant : soit
    // ANTHROPIC_API_KEY n'est pas du tout configurée (le SDK refuse alors
    // l'appel avant même de le faire, avec une Error générique — pas une
    // AuthenticationError, réservée aux vrais 401 renvoyés par l'API), soit
    // une clé est présente mais invalide/révoquée (là, une vraie
    // AuthenticationError).
    const missingCredentials =
      error instanceof Error && error.message.includes('Could not resolve authentication method');
    if (missingCredentials || error instanceof Anthropic.AuthenticationError) {
      return "IGINI n'est pas encore configuré pour générer du contenu (identifiants manquants ou invalides côté serveur).";
    }
    if (error instanceof Anthropic.RateLimitError) {
      return 'IGINI reçoit trop de demandes pour le moment — réessaie dans quelques minutes.';
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return "Impossible de contacter IGINI pour l'instant — réessaie dans un instant.";
    }
    return fallback;
  }
}

/** Ajoute l'usage d'un tour supplémentaire (reprise après `pause_turn`). */
function addUsage(total: ClaudeTokenUsage, next: ClaudeTokenUsage): ClaudeTokenUsage {
  return {
    input_tokens: total.input_tokens + next.input_tokens,
    output_tokens: total.output_tokens + next.output_tokens,
    output_tokens_details: {
      thinking_tokens:
        (total.output_tokens_details?.thinking_tokens ?? 0) +
        (next.output_tokens_details?.thinking_tokens ?? 0),
    },
    cache_creation_input_tokens:
      (total.cache_creation_input_tokens ?? 0) + (next.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (total.cache_read_input_tokens ?? 0) + (next.cache_read_input_tokens ?? 0),
    server_tool_use: {
      web_search_requests:
        (total.server_tool_use?.web_search_requests ?? 0) +
        (next.server_tool_use?.web_search_requests ?? 0),
    },
  };
}

/**
 * Les sources réellement consultées, jamais celles que le modèle
 * prétendrait avoir vues — voir le commentaire sur `WebSearchSource`.
 * Dédupliquées par URL : plusieurs recherches d'un même appel renvoient
 * souvent la même page.
 */
function extractWebSearchSources(content: Anthropic.ContentBlock[]): WebSearchSource[] {
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      sources.push({ title: result.title, url: result.url });
    }
  }
  return sources;
}

/**
 * Les pages réellement ouvertes — voir `PageLue`. Lues dans tous les tours
 * de l'appel (une lecture peut avoir eu lieu avant un `pause_turn`). Une
 * lecture en erreur n'en fait pas partie : une page refusée ou injoignable
 * n'a pas été lue, et la présenter comme telle serait exactement le mensonge
 * que cette liste existe pour empêcher.
 */
function extractPagesLues(
  messages: Anthropic.MessageParam[],
  dernierTour: Anthropic.ContentBlock[],
): PageLue[] {
  const blocs: unknown[] = [];
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) blocs.push(...message.content);
  }
  blocs.push(...(dernierTour ?? []));
  const vues = new Set<string>();
  const pages: PageLue[] = [];
  for (const bloc of blocs as Anthropic.ContentBlock[]) {
    if (bloc.type !== 'web_fetch_tool_result' || bloc.content.type !== 'web_fetch_result') continue;
    const { url, retrieved_at, content } = bloc.content;
    if (vues.has(url)) continue;
    vues.add(url);
    pages.push({ url, titre: content?.title ?? null, luLe: retrieved_at ?? null });
  }
  return pages;
}
