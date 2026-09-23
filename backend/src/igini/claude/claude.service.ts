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
import { AiUsageService, type AiUsageContext } from '../usage/ai-usage.service.js';
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
}

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

  async generateStructuredOutput<T>(request: StructuredOutputRequest<T>): Promise<T> {
    // Le verrou est ici, et pas dans chaque générateur : les cinq passent
    // par ce point unique, donc aucun d'eux ne peut être oublié le jour où
    // un sixième arrive.
    const availability = this.availability();
    if (!availability.enabled) {
      throw new ServiceUnavailableException(availability.reason);
    }

    // Le plafond mensuel, au même endroit et pour la même raison : les cinq
    // générateurs passent ici, donc aucun ne peut être oublié.
    //
    // **Avant** l'appel réseau, et **hors** du try. Avant, parce qu'un
    // plafond vérifié après la dépense ne borne rien. Hors du try, parce que
    // le catch traduit toute exception en 500 : un refus de quota avalé là
    // ressortirait en « erreur interne », et la personne ne saurait pas que
    // son forfait est consommé.
    // Ce que l'offre couvre, au même endroit et pour la même raison que le
    // plafond : les cinq générateurs passent ici.
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
      const response = await this.getClient().messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: request.system,
        messages: [{ role: 'user', content: request.userContent }],
        output_config: { format: zodOutputFormat(request.schema) },
      });

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
          usage: response.usage,
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

      return response.parsed_output;
    } catch (error) {
      this.logger.error(request.logContext, error as Error);
      throw new InternalServerErrorException(this.toSafeMessage(error, request.userErrorMessage));
    }
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
