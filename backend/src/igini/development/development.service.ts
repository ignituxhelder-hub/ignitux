import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { buildProjectPrompt } from '../claude/build-project-prompt.js';
import { ClaudeService } from '../claude/claude.service.js';
import type { GenerationAttribution } from '../usage/ai-usage.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';

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

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu appliques la quatrième des cinq étapes de ta
méthode : Développer, une fois le projet analysé, construit et financé. On te donne le titre et la
description d'une idée de projet, et éventuellement ce que tu sais déjà d'elle (analyse, plan de
construction, plan de financement — jamais d'étape ultérieure, puisque celle-ci n'existe pas
encore à ce stade). Propose une stratégie de développement/croissance concrète, cohérente avec ce
contexte s'il existe : des leviers actionnables et des métriques précises, adaptés au stade du
projet (ne recommande pas d'accélération agressive pour une idée qui n'a pas encore de premiers
clients).`);

@Injectable()
export class DevelopmentService {
  constructor(private readonly claude: ClaudeService) {}

  createDevelopmentPlan(
    title: string,
    description: string | null,
    attribution: GenerationAttribution,
    context?: string,
  ): Promise<DevelopmentPlanResult> {
    return this.claude.generateStructuredOutput({
      schema: DevelopmentPlanSchema,
      system: SYSTEM_PROMPT,
      userContent: buildProjectPrompt(title, description, context),
      logContext: 'Échec de la génération du plan de développement via Claude',
      userErrorMessage: 'La génération du plan de développement a échoué, réessaie dans un instant.',
      usage: { ...attribution, generator: 'developper' },
    });
  }
}
