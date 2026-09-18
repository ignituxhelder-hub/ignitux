import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeService } from '../claude/claude.service.js';
import { IGINI_IDENTITY } from '../claude/igini-identity.js';

const TransmissionPlanSchema = z.object({
  summary: z
    .string()
    .describe('Résumé en 2 à 3 phrases de la stratégie de transmission recommandée'),
  transfer_options: z
    .array(z.string())
    .describe(
      "3 à 6 options de transmission adaptées au stade du projet (vente, succession, " +
        'association avec un repreneur, transfert à une équipe, etc.), chacune brièvement justifiée',
    ),
  key_documentation: z
    .array(z.string())
    .describe(
      '3 à 6 éléments clés à documenter ou formaliser avant toute transmission (processus, ' +
        'contrats, propriété intellectuelle, finances, etc.)',
    ),
  readiness_checklist: z
    .array(z.string())
    .describe('3 à 6 actions concrètes pour rendre le projet transmissible'),
});

export type TransmissionPlanResult = z.infer<typeof TransmissionPlanSchema>;

const SYSTEM_PROMPT = `${IGINI_IDENTITY}

Ici, tu appliques la troisième étape de ta méthode : Transmettre. On te donne le titre et la
description d'une idée de projet. Propose une stratégie de transmission réaliste : ne recommande
pas une vente à des investisseurs pour une idée qui n'a pas encore été construite, et reste
concret sur ce qu'il faut documenter ou préparer avant de pouvoir transmettre le projet à
quelqu'un d'autre (associé, successeur, repreneur, ou simplement une nouvelle équipe).`;

@Injectable()
export class TransmissionService {
  constructor(private readonly claude: ClaudeService) {}

  createTransmissionPlan(
    title: string,
    description: string | null,
  ): Promise<TransmissionPlanResult> {
    return this.claude.generateStructuredOutput({
      schema: TransmissionPlanSchema,
      system: SYSTEM_PROMPT,
      userContent: `Titre : ${title}\nDescription : ${description ?? '(aucune description fournie)'}`,
      logContext: 'Échec de la génération du plan de transmission via Claude',
      userErrorMessage: 'La génération du plan de transmission a échoué, réessaie dans un instant.',
    });
  }
}
