import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeService } from '../claude/claude.service.js';
import { IGINI_IDENTITY } from '../claude/igini-identity.js';

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

const SYSTEM_PROMPT = `${IGINI_IDENTITY}

Ici, tu conseilles sur le financement, dans la continuité de Construire. On te donne le titre et
la description d'une idée de projet. Propose une stratégie de financement réaliste et adaptée au
stade du projet : ne recommande pas une levée de fonds en capital-risque pour une idée qui n'a pas
encore été validée, et reste concret sur les montants et les sources.`;

@Injectable()
export class FinancingService {
  constructor(private readonly claude: ClaudeService) {}

  createFinancingPlan(title: string, description: string | null): Promise<FinancingPlanResult> {
    return this.claude.generateStructuredOutput({
      schema: FinancingPlanSchema,
      system: SYSTEM_PROMPT,
      userContent: `Titre : ${title}\nDescription : ${description ?? '(aucune description fournie)'}`,
      logContext: 'Échec de la génération du plan de financement via Claude',
      userErrorMessage: 'La génération du plan de financement a échoué, réessaie dans un instant.',
    });
  }
}
