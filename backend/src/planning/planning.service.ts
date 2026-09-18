import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeService } from '../claude/claude.service.js';

const BuildPlanSchema = z.object({
  summary: z.string().describe("Résumé en 2 à 3 phrases de l'approche de construction recommandée"),
  estimated_timeline: z
    .string()
    .describe("Estimation grossière du temps nécessaire pour une première version, ex. '3 à 6 mois'"),
  milestones: z
    .array(z.string())
    .describe('4 à 8 jalons concrets, dans l\'ordre chronologique, pour construire ce projet'),
  key_resources: z
    .array(z.string())
    .describe('3 à 5 ressources clés nécessaires : compétences, outils, partenaires'),
});

export type BuildPlanResult = z.infer<typeof BuildPlanSchema>;

const SYSTEM_PROMPT = `Tu es le planificateur d'Ignitux, une plateforme qui aide des porteurs de
projet à transformer une idée en réalité. On te donne le titre et la description d'une idée de
projet. Propose un plan de construction concret et réaliste : des jalons actionnables (pas de
généralités type "faire une étude de marché" sans préciser comment), adaptés au stade de l'idée
décrite.`;

@Injectable()
export class PlanningService {
  constructor(private readonly claude: ClaudeService) {}

  createBuildPlan(title: string, description: string | null): Promise<BuildPlanResult> {
    return this.claude.generateStructuredOutput({
      schema: BuildPlanSchema,
      system: SYSTEM_PROMPT,
      userContent: `Titre : ${title}\nDescription : ${description ?? '(aucune description fournie)'}`,
      logContext: 'Échec de la génération du plan de construction via Claude',
      userErrorMessage: 'La génération du plan a échoué, réessaie dans un instant.',
    });
  }
}
