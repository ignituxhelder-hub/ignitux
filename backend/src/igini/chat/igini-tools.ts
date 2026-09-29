import { HttpException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MEMORY_CATEGORIES } from '../memory/memory-category.js';

/**
 * LES 7 OUTILS DE L'ORCHESTRATEUR IGINI.
 *
 * Chacun est une enveloppe fine autour d'un service déjà testé et déjà
 * gardé (offres, quota, propriété du projet) — ce fichier ne décide jamais
 * lui-même si un appel est autorisé, il ne fait que décrire l'outil à
 * Claude et valider la forme de ce qu'il envoie. L'exécution vit dans
 * `IginiToolsService` (igini-tools.service.ts), qui a besoin de Nest/Prisma
 * et donc ne peut pas être ici.
 */
export const TOOL_NAMES = [
  'lister_projets',
  'rappeler_souvenirs',
  'analyser',
  'construire',
  'financer',
  'developper',
  'transmettre',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Les 5 outils qui déclenchent un générateur existant, tous avec la même forme d'entrée. */
const GENERATOR_TOOL_NAMES = ['analyser', 'construire', 'financer', 'developper', 'transmettre'] as const;

export const PROJECT_ID_INPUT_SCHEMA = z.object({
  project_id: z.string().min(1, 'project_id est requis.'),
});

export const RAPPELER_SOUVENIRS_INPUT_SCHEMA = z.object({
  project_id: z.string().min(1).optional(),
  categorie: z.enum(MEMORY_CATEGORIES).optional(),
});

const GENERATOR_TOOL_DESCRIPTIONS: Record<(typeof GENERATOR_TOOL_NAMES)[number], string> = {
  analyser:
    "Lance l'étape Analyser d'Igini sur un projet précis : résumé, score de faisabilité, points forts, " +
    "risques, prochaines étapes. Coûte un appel IA et compte dans le quota du plan de la personne — ne " +
    "l'appelle que si elle l'a explicitement demandé ou confirmé.",
  construire:
    'Lance l’étape Construire (plan de construction : jalons, délai estimé, ressources clés). Mêmes ' +
    'règles de confirmation que analyser.',
  financer:
    'Lance l’étape Financer (plan de financement : budget estimé, sources, postes de dépense). Mêmes ' +
    'règles de confirmation que analyser.',
  developper:
    'Lance l’étape Développer (plan de croissance : leviers, indicateurs clés, risques). Mêmes règles de ' +
    'confirmation que analyser.',
  transmettre:
    'Lance l’étape Transmettre (options de transfert, documentation, check-list). Mêmes règles de ' +
    'confirmation que analyser.',
};

const generatorTools: Anthropic.Tool[] = GENERATOR_TOOL_NAMES.map((name) => ({
  name,
  description: GENERATOR_TOOL_DESCRIPTIONS[name],
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: "UUID du projet, obtenu via l'outil lister_projets si tu ne le connais pas déjà.",
      },
    },
    required: ['project_id'],
  },
}));

export const IGINI_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'lister_projets',
    description:
      'Liste les projets de la personne connectée (identifiant, titre, secteur). Utilise cet outil pour ' +
      "retrouver l'identifiant d'un projet mentionné par son nom, avant d'appeler un autre outil qui a " +
      'besoin de project_id.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'rappeler_souvenirs',
    description:
      "Relit les souvenirs déjà enregistrés (décisions, préférences, apprentissages, faits) de la " +
      'personne, éventuellement filtrés par projet et par catégorie. Sans project_id, ne renvoie que ses ' +
      'souvenirs personnels non liés à un projet précis.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUID du projet (optionnel).' },
        categorie: {
          type: 'string',
          enum: [...MEMORY_CATEGORIES],
          description: 'Filtrer par catégorie (optionnel).',
        },
      },
      required: [],
    },
  },
  ...generatorTools,
];

/**
 * Traduit n'importe quelle erreur d'exécution d'outil en texte lisible pour
 * `tool_result`. Couvre les trois formes réellement rencontrées : une
 * `HttpException` à corps texte (`assertWithinQuota`), une `HttpException` à
 * corps objet (`offres.exiger`, qui pose `{ message, offreQuiOuvre, ... }`),
 * et une entrée invalide envoyée par le modèle (`ZodError`).
 */
export function toToolErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "L'entrée fournie à l'outil est invalide.";
  }
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' ');
    return error.message;
  }
  return error instanceof Error ? error.message : 'Erreur inconnue.';
}
