import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeService } from '../claude/claude.service.js';
import { IGINI_IDENTITY } from '../claude/igini-identity.js';

const DevelopmentPlanSchema = z.object({
  summary: z.string().describe('Résumé en 2 à 3 phrases de la stratégie de croissance recommandée'),
  growth_levers: z
    .array(z.string())
    .describe(
      "3 à 6 leviers de croissance concrets (acquisition, partenariats, canaux, etc.), adaptés au stade du projet",
    ),
  key_metrics: z
    .array(z.string())
    .describe('3 à 5 indicateurs clés à suivre pour mesurer la croissance'),
  scaling_risks: z
    .array(z.string())
    .describe('3 à 5 risques ou points de vigilance au moment de passer à l\'échelle'),
});

export type DevelopmentPlanResult = z.infer<typeof DevelopmentPlanSchema>;

const SYSTEM_PROMPT = `${IGINI_IDENTITY}

Ici, tu conseilles sur la croissance, une fois le projet analysé, construit et financé. On te
donne le titre et la description d'une idée de projet. Propose une stratégie de
développement/croissance concrète : des leviers actionnables et des métriques précises, adaptés
au stade du projet (ne recommande pas d'accélération agressive pour une idée qui n'a pas encore
de premiers clients).`;

@Injectable()
export class DevelopmentService {
  constructor(private readonly claude: ClaudeService) {}

  createDevelopmentPlan(title: string, description: string | null): Promise<DevelopmentPlanResult> {
    return this.claude.generateStructuredOutput({
      schema: DevelopmentPlanSchema,
      system: SYSTEM_PROMPT,
      userContent: `Titre : ${title}\nDescription : ${description ?? '(aucune description fournie)'}`,
      logContext: 'Échec de la génération du plan de développement via Claude',
      userErrorMessage: 'La génération du plan de développement a échoué, réessaie dans un instant.',
    });
  }
}
