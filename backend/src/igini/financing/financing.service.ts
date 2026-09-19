import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { buildProjectPrompt } from '../claude/build-project-prompt.js';
import { ClaudeService } from '../claude/claude.service.js';
import type { GenerationAttribution } from '../usage/ai-usage.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';

const FinancingPlanSchema = z.object({
  summary: z.string().describe('Résumé en 2 à 3 phrases de la stratégie de financement recommandée'),
  estimated_budget: z
    .string()
    .describe("Fourchette budgétaire estimée pour lancer le projet, ex. '10 000 € à 30 000 €'"),
  funding_sources: z
    .array(z.string())
    .describe(
      '3 à 6 pistes de financement adaptées au stade du projet (autofinancement, subventions, ' +
        'prêt, business angels, crowdfunding, etc.), chacune avec une brève justification',
    ),
  budget_breakdown: z
    .array(z.string())
    .describe('3 à 6 principaux postes de dépense à prévoir, avec un ordre de grandeur'),
});

export type FinancingPlanResult = z.infer<typeof FinancingPlanSchema>;

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu appliques la troisième des cinq étapes de ta
méthode : Financer, dans la continuité de Construire. On te donne le titre et la description
d'une idée de projet, et éventuellement ce que tu sais déjà d'elle (analyse, plan de construction
— jamais d'étape ultérieure, puisque celles-ci n'existent pas encore à ce stade). Propose une
stratégie de financement réaliste, cohérente avec ce contexte s'il existe : ne recommande pas une
levée de fonds en capital-risque pour une idée qui n'a pas encore été validée, et reste concret sur
les montants et les sources.`);

@Injectable()
export class FinancingService {
  constructor(private readonly claude: ClaudeService) {}

  createFinancingPlan(
    title: string,
    description: string | null,
    attribution: GenerationAttribution,
    context?: string,
  ): Promise<FinancingPlanResult> {
    return this.claude.generateStructuredOutput({
      schema: FinancingPlanSchema,
      system: SYSTEM_PROMPT,
      userContent: buildProjectPrompt(title, description, context),
      logContext: 'Échec de la génération du plan de financement via Claude',
      userErrorMessage: 'La génération du plan de financement a échoué, réessaie dans un instant.',
      usage: { ...attribution, generator: 'financer' },
    });
  }
}
