import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

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
}

/**
 * Point d'entrée unique vers l'API Claude pour les fonctionnalités IA
 * d'Ignitux (analyse, planification, …). Chaque appelant fournit un schéma
 * Zod et un prompt ; ce service gère le client, le format de sortie
 * structurée et la traduction des erreurs en réponses HTTP propres.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | undefined;

  // Instancié à la première utilisation (et pas comme champ de classe) pour
  // que l'absence d'identifiants (ANTHROPIC_API_KEY ou autre mécanisme pris
  // en charge par le SDK) ne fasse pas planter tout le démarrage de Nest,
  // seulement l'appel qui en a besoin.
  private getClient(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  async generateStructuredOutput<T>(request: StructuredOutputRequest<T>): Promise<T> {
    try {
      const response = await this.getClient().messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: request.system,
        messages: [{ role: 'user', content: request.userContent }],
        output_config: { format: zodOutputFormat(request.schema) },
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
