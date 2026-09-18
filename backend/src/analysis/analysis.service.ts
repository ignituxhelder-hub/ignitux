import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const ProjectAnalysisSchema = z.object({
  summary: z.string().describe("Résumé en 2 à 3 phrases de l'idée et de son potentiel"),
  feasibility_score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe('Score de faisabilité de 1 (très risqué) à 10 (très solide)'),
  strengths: z.array(z.string()).describe('3 à 5 points forts du projet'),
  risks: z.array(z.string()).describe('3 à 5 risques ou angles morts'),
  next_steps: z.array(z.string()).describe('3 à 5 prochaines actions concrètes recommandées'),
});

export type ProjectAnalysisResult = z.infer<typeof ProjectAnalysisSchema>;

const SYSTEM_PROMPT = `Tu es l'analyste d'Ignitux, une plateforme qui aide des porteurs de projet à
transformer une idée en réalité. On te donne le titre et la description d'une idée de projet.
Évalue-la avec honnêteté et bienveillance : sois concret, évite le remplissage générique, et
adapte le niveau d'exigence à ce qui est décrit (une idée à un stade précoce n'est pas jugée
comme un business plan complet).`;

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private client: Anthropic | undefined;

  // Instancié à la première utilisation (et pas comme champ de classe) pour
  // que l'absence d'identifiants (ANTHROPIC_API_KEY ou autre mécanisme pris
  // en charge par le SDK) ne fasse pas planter tout le démarrage de Nest,
  // seulement l'appel qui en a besoin.
  private getClient(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  async analyzeProject(title: string, description: string | null): Promise<ProjectAnalysisResult> {
    try {
      const response = await this.getClient().messages.parse({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Titre : ${title}\nDescription : ${description ?? '(aucune description fournie)'}`,
          },
        ],
        output_config: { format: zodOutputFormat(ProjectAnalysisSchema) },
      });

      if (!response.parsed_output) {
        throw new Error('parsed_output manquant dans la réponse Claude.');
      }

      return response.parsed_output;
    } catch (error) {
      this.logger.error("Échec de l'analyse du projet via Claude", error as Error);
      throw new InternalServerErrorException("L'analyse a échoué, réessaie dans un instant.");
    }
  }
}
