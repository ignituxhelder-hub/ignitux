import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { OffresService } from '../../offres/offres.service.js';
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
   * Qui déclenche l'appel, sur quel projet, via quel générateur.
   *
   * **Obligatoire, et c'est le point.** Ce champ n'est pas optionnel pour que
   * TypeScript refuse de compiler un générateur qui ne dirait pas à qui
   * attribuer sa dépense. Le verrou du budget et celui de l'anonymat sont le
   * même verrou : un appel facturé sans propriétaire est un appel qu'aucun
   * plafond ne pourra jamais décompter.
   */
  usage: AiUsageContext;
  /**
   * Absent par défaut : les générateurs qui n'en ont pas besoin ne changent
   * pas de comportement, tokens et signature de retour compris. Quand il est
   * fourni, `generateStructuredOutput` renvoie un `sources` en plus — voir
   * les deux signatures ci-dessous.
   */
  webSearch?: WebSearchOptions;
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
 * structurée, la traduction des erreurs en réponses HTTP propres, et
 * l'enregistrement de ce que l'appel a réellement coûté.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | undefined;

  constructor(
    private readonly aiUsage: AiUsageService,
    private readonly offres: OffresService,
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
    request: StructuredOutputRequest<T> & { webSearch?: undefined },
  ): Promise<T>;
  async generateStructuredOutput<T>(
    request: StructuredOutputRequest<T> & { webSearch: WebSearchOptions },
  ): Promise<T & { sources: WebSearchSource[] }>;
  async generateStructuredOutput<T>(
    request: StructuredOutputRequest<T>,
  ): Promise<T | (T & { sources: WebSearchSource[] })> {
    // Le verrou est ici, et pas dans chaque générateur : les six passent
    // par ce point unique, donc aucun d'eux ne peut être oublié le jour où
    // un septième arrive.
    const availability = this.availability();
    if (!availability.enabled) {
      throw new ServiceUnavailableException(availability.reason);
    }

    // Le plafond mensuel, au même endroit et pour la même raison : les six
    // générateurs passent ici, donc aucun ne peut être oublié.
    //
    // **Avant** l'appel réseau, et **hors** du try. Avant, parce qu'un
    // plafond vérifié après la dépense ne borne rien. Hors du try, parce que
    // le catch traduit toute exception en 500 : un refus de quota avalé là
    // ressortirait en « erreur interne », et la personne ne saurait pas que
    // son forfait est consommé.
    // Ce que l'offre couvre, au même endroit et pour la même raison que le
    // plafond : les six générateurs passent ici.
    //
    // **Avant** le plafond global, et l'ordre a un sens. Le plafond
    // technique protège le budget d'Ignitux ; l'offre décrit ce que la
    // personne a souscrit. Lui répondre « plafond atteint » alors que son
    // offre n'inclut simplement pas ce générateur lui ferait attendre un
    // mois pour rien.
    await this.offres.exiger(request.usage.userId, {
      kind: 'generer',
      generateur: request.usage.generator,
      appelsCeMois: await this.aiUsage.callsThisMonth(request.usage.userId),
    });

    await this.aiUsage.assertWithinQuota(request.usage.userId);

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
      // sous-évaluerait le coût réel de l'appel. Hors recherche web, aucun
      // outil serveur n'est déclaré et ce tour ne peut pas se produire — la
      // boucle ne s'exécute donc jamais pour les quatre autres générateurs,
      // et `usage` reste `response.usage` sans transformation.
      if (request.webSearch) {
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

      if (!request.webSearch) {
        return response.parsed_output;
      }

      return { ...response.parsed_output, sources: extractWebSearchSources(response.content) };
    } catch (error) {
      this.logger.error(request.logContext, error as Error);
      throw new InternalServerErrorException(this.toSafeMessage(error, request.userErrorMessage));
    }
  }

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
