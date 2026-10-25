import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { buildProjectPrompt } from '../claude/build-project-prompt.js';
import { ClaudeService } from '../claude/claude.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';

/** Trois au plus : au-delà, on retombe dans le formulaire qu'on voulait éviter. */
export const QUESTIONS_IGINI_MAX = 3;

const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe('La question, tutoyée, courte, à laquelle on répond en une ou deux phrases'),
        pourquoi: z
          .string()
          .describe('En une phrase : ce que la réponse changera concrètement dans tes analyses'),
      }),
    )
    .max(QUESTIONS_IGINI_MAX)
    .describe(
      `0 à ${QUESTIONS_IGINI_MAX} questions. Zéro est une bonne réponse quand le projet est déjà assez décrit.`,
    ),
});

export type QuestionsIgini = z.infer<typeof QuestionsSchema>;

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu ne produis pas encore d'analyse. La personne
vient de décrire son projet et de répondre à un questionnaire fixe (ce que tu sais d'elle et du
projet est fourni). Ton rôle : repérer ce qui MANQUE encore et changerait réellement tes futures
analyses (forme juridique, conformité, plan, financement), puis poser au plus trois questions
pour le combler.

Règles :
- Ne repose jamais une question déjà répondue, même formulée autrement. « Je ne sais pas encore »
  est une réponse : ne la redemande pas.
- Une question doit porter sur CE projet (son produit, ses clients, son marché, ses contraintes),
  pas sur des généralités.
- Pas de question sur la santé, la religion, les opinions, la vie familiale ou toute donnée
  sensible : elles n'ont rien à faire dans une analyse de projet.
- Si rien d'important ne manque, ne pose aucune question. Mieux vaut zéro question qu'une question
  de remplissage.`);

/**
 * QUESTIONNER — les deux ou trois questions qui manquent encore.
 *
 * Le questionnaire fixe couvre ce que tous les projets partagent ; celui-ci
 * couvre ce qui est propre à CE projet (un food-truck n'a pas les mêmes
 * inconnues qu'un logiciel). Payé en crédits comme les autres appels, à son
 * prix (le plus bas du barème) — voir credits/bareme.ts.
 */
@Injectable()
export class QuestionnerService {
  constructor(private readonly claude: ClaudeService) {}

  async questionsPour(
    titre: string,
    description: string | null,
    attribution: { userId: string; projectId: string },
    contexte?: string,
  ): Promise<QuestionsIgini> {
    const resultat = await this.claude.generateStructuredOutput({
      schema: QuestionsSchema,
      system: SYSTEM_PROMPT,
      userContent: buildProjectPrompt(titre, description, contexte),
      logContext: 'Échec de la génération des questions du questionnaire via Claude',
      userErrorMessage: 'IGINI n’a pas pu préparer ses questions, ce n’est pas bloquant.',
      usage: { ...attribution, generator: 'questionner' },
    });
    // Le schéma borne déjà à trois ; on recoupe quand même, parce qu'un
    // dépassement ici remettrait un formulaire sous les yeux de la personne.
    return {
      questions: resultat.questions
        .filter((q) => q.question.trim().length > 0)
        .slice(0, QUESTIONS_IGINI_MAX),
    };
  }
}
