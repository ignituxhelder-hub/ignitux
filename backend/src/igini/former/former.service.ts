import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { buildProjectPrompt } from '../claude/build-project-prompt.js';
import { ClaudeService, type WebSearchSource } from '../claude/claude.service.js';
import type { GenerationAttribution } from '../usage/ai-usage.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';

/**
 * Les six formes couvertes en v1 — pas une liste exhaustive du droit des
 * sociétés françaises, mais celles qu'un porteur de projet croise le plus
 * souvent, seul ou à plusieurs. Voir la spec pour pourquoi ces six-là.
 */
const LEGAL_FORMS = ['micro-entreprise', 'EI', 'EURL', 'SASU', 'SARL', 'SAS'] as const;

const LegalFormRecommendationSchema = z.object({
  recommended_form: z
    .enum(LEGAL_FORMS)
    .describe('La forme juridique la plus adaptée au projet décrit, parmi les six couvertes.'),
  rationale: z
    .string()
    .describe('Pourquoi cette forme, ancré dans ce que le projet décrit réellement — pas une généralité.'),
  assumptions: z
    .array(
      z.object({
        subject: z
          .string()
          .describe("Le sujet sur lequel une information manquait, ex. « nombre d'associés »."),
        assumption: z.string().describe("L'hypothèse retenue en l'absence de cette information."),
        how_to_correct: z.string().describe('Comment corriger si cette hypothèse est fausse.'),
      }),
    )
    .describe('Vide si le texte du projet suffisait déjà à trancher sans hypothèse.'),
  alternatives: z
    .array(
      z.object({
        form: z.enum(LEGAL_FORMS),
        why_not_chosen: z.string(),
      }),
    )
    .describe("1 à 2 formes alternatives sérieusement envisagées, et pourquoi elles n'ont pas été retenues."),
  points_to_check: z
    .array(z.string())
    .describe(
      "Ex. seuils de chiffre d'affaires ou taux de cotisations en vigueur, si la recherche web n'a rien " +
        'confirmé de plus récent que ce que le modèle savait déjà.',
    ),
});

export type LegalFormRecommendationResult = z.infer<typeof LegalFormRecommendationSchema> & {
  sources: WebSearchSource[];
};

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu recommandes une forme juridique adaptée au projet qu'on te
décrit, parmi six formes courantes : micro-entreprise, EI, EURL, SASU, SARL, SAS. Base-toi sur ce que le
projet dit déjà — seul ou à plusieurs, ambition de chiffre d'affaires, patrimoine à protéger, nature de
l'activité. Quand une information te manque pour trancher avec confiance, ne bloque jamais : suppose
explicitement ce qui te semble le plus probable, et dis noir sur blanc quelle hypothèse tu as prise et
comment la corriger si elle est fausse.

Ta recommandation est une aide à la décision que la personne valide elle-même — jamais une décision prise
à sa place. Dans les cas ambigus (activité réglementée, associés aux apports très inégaux, patrimoine
personnel important à protéger), dis explicitement qu'il vaut mieux vérifier auprès d'un comptable ou d'un
avocat avant de trancher.

Tu as accès à une recherche web : utilise-la pour vérifier les seuils et taux en vigueur (plafonds de
chiffre d'affaires de la micro-entreprise, cotisations sociales) plutôt que de réciter ce que tu as appris
à l'entraînement — ces chiffres changent chaque année.`);

/** Recherches autorisées par appel — voir ai-pricing.ts pour ce qu'elles coûtent. */
const WEB_SEARCH_MAX_USES = 5;

@Injectable()
export class FormerService {
  constructor(private readonly claude: ClaudeService) {}

  recommendLegalForm(
    title: string,
    description: string | null,
    attribution: GenerationAttribution,
    context?: string,
  ): Promise<LegalFormRecommendationResult> {
    return this.claude.generateStructuredOutput({
      schema: LegalFormRecommendationSchema,
      system: SYSTEM_PROMPT,
      userContent: buildProjectPrompt(title, description, context),
      logContext: 'Échec de la recommandation de forme juridique via Claude',
      userErrorMessage: 'La recommandation a échoué, réessaie dans un instant.',
      usage: { ...attribution, generator: 'former' },
      webSearch: { maxUses: WEB_SEARCH_MAX_USES },
    });
  }
}
