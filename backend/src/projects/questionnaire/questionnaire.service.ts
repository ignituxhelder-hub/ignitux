import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { QuestionnerService } from '../../igini/questionner/questionner.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SECTEURS } from '../../profile/profile-fields.js';
import { chargerContexteDeclare } from './charger-contexte.js';
import {
  ETAPES,
  fusionnerReponses,
  JE_NE_SAIS_PAS,
  lireReponses,
  QUESTIONS_PROJET,
  ReponseInvalide,
  type EtapeQuestionnaire,
  type QuestionProjet,
  type ReponsesProjet,
} from './questionnaire-catalogue.js';

export interface QuestionIginiVue {
  id: string;
  question: string;
  pourquoi: string | null;
  reponse: string | null;
}

export interface QuestionnaireVue {
  etapes: readonly EtapeQuestionnaire[];
  questions: readonly QuestionProjet[];
  /** Le secteur y figure sous `secteur`, lu dans `projects.sector`. */
  reponses: ReponsesProjet;
  termine: boolean;
  /** IGINI a-t-il déjà préparé ses questions (même zéro) ? */
  questionsIginiPreparees: boolean;
  questionsIgini: QuestionIginiVue[];
}

/**
 * LE QUESTIONNAIRE DU PROJET — lecture, écriture, et les questions d'IGINI.
 *
 * Propriétaire seulement : ce sont ses réponses sur son projet, et un
 * collaborateur qui les modifierait changerait ce qu'IGINI croit savoir
 * d'elle.
 */
@Injectable()
export class QuestionnaireService {
  private readonly logger = new Logger(QuestionnaireService.name);
  /** Un double clic ne doit pas payer deux fois les mêmes questions. */
  private readonly preparationEnCours = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionner: QuestionnerService,
  ) {}

  private async projetDe(ownerId: string, projectId: string) {
    const projet = await this.prisma.projects.findFirst({
      where: { id: projectId, owner_id: ownerId },
    });
    if (!projet) throw new NotFoundException('Projet introuvable.');
    return projet;
  }

  async vue(ownerId: string, projectId: string): Promise<QuestionnaireVue> {
    const projet = await this.projetDe(ownerId, projectId);
    const [ligne, questionsIgini] = await Promise.all([
      this.prisma.project_questionnaires.findUnique({ where: { project_id: projectId } }),
      this.prisma.project_igini_questions.findMany({
        where: { project_id: projectId },
        orderBy: { position: 'asc' },
      }),
    ]);

    const reponses = lireReponses(ligne?.reponses);
    if (projet.sector) reponses.secteur = projet.sector;

    return {
      etapes: ETAPES,
      questions: QUESTIONS_PROJET,
      reponses,
      termine: !!ligne?.termine_le,
      questionsIginiPreparees: !!ligne?.questions_igini_le,
      questionsIgini: questionsIgini.map((q) => ({
        id: q.id,
        question: q.question,
        pourquoi: q.pourquoi,
        reponse: q.reponse,
      })),
    };
  }

  async enregistrer(
    ownerId: string,
    projectId: string,
    entrees: Record<string, unknown>,
    termine?: boolean,
  ): Promise<QuestionnaireVue> {
    await this.projetDe(ownerId, projectId);
    const ligne = await this.prisma.project_questionnaires.findUnique({
      where: { project_id: projectId },
    });

    let reponses: ReponsesProjet;
    try {
      reponses = fusionnerReponses(lireReponses(ligne?.reponses), entrees);
    } catch (erreur) {
      if (erreur instanceof ReponseInvalide) throw new BadRequestException(erreur.message);
      throw erreur;
    }

    if ('secteur' in entrees) {
      await this.prisma.projects.update({
        where: { id: projectId },
        data: { sector: this.secteurDepuis(entrees.secteur) },
      });
    }

    const termineLe = termine ? new Date() : undefined;
    await this.prisma.project_questionnaires.upsert({
      where: { project_id: projectId },
      create: {
        project_id: projectId,
        reponses: reponses as Prisma.InputJsonValue,
        termine_le: termineLe ?? null,
      },
      update: {
        reponses: reponses as Prisma.InputJsonValue,
        ...(termineLe ? { termine_le: termineLe } : {}),
      },
    });

    return this.vue(ownerId, projectId);
  }

  /** « Je ne sais pas encore » laisse le secteur vide : c'est ce qu'il veut dire. */
  private secteurDepuis(brut: unknown): string | null {
    if (brut === null || brut === undefined || brut === '' || brut === JE_NE_SAIS_PAS) return null;
    if (typeof brut === 'string' && (SECTEURS as readonly string[]).includes(brut)) return brut;
    throw new BadRequestException(`« ${typeof brut === 'string' ? brut : JSON.stringify(brut)} » n’est pas un secteur connu.`);
  }

  /**
   * Fait préparer à IGINI ses questions, une seule fois par projet.
   *
   * Un échec (IA coupée, plafond de coût, panne) n'est PAS enregistré comme
   * « préparé » : la personne pourra réessayer plus tard. Il remonte au
   * client, qui saute simplement l'étape — rien n'en dépend.
   */
  async preparerQuestionsIgini(ownerId: string, projectId: string): Promise<QuestionnaireVue> {
    const projet = await this.projetDe(ownerId, projectId);
    const ligne = await this.prisma.project_questionnaires.findUnique({
      where: { project_id: projectId },
    });
    if (ligne?.questions_igini_le || this.preparationEnCours.has(projectId)) {
      return this.vue(ownerId, projectId);
    }

    this.preparationEnCours.add(projectId);
    try {
      const contexte = await chargerContexteDeclare(this.prisma, ownerId, projectId);
      const { questions } = await this.questionner.questionsPour(
        projet.title,
        projet.description,
        { userId: ownerId, projectId },
        contexte,
      );

      await this.prisma.$transaction([
        this.prisma.project_igini_questions.createMany({
          data: questions.map((q, position) => ({
            project_id: projectId,
            question: q.question.trim(),
            pourquoi: q.pourquoi.trim() || null,
            position,
          })),
        }),
        this.prisma.project_questionnaires.upsert({
          where: { project_id: projectId },
          create: { project_id: projectId, questions_igini_le: new Date() },
          update: { questions_igini_le: new Date() },
        }),
      ]);
    } finally {
      this.preparationEnCours.delete(projectId);
    }

    return this.vue(ownerId, projectId);
  }

  /** Enregistre les réponses aux questions d'IGINI et clôt le questionnaire. */
  async repondreQuestionsIgini(
    ownerId: string,
    projectId: string,
    reponses: Array<{ id: string; reponse?: string | null }>,
  ): Promise<QuestionnaireVue> {
    await this.projetDe(ownerId, projectId);

    for (const r of reponses) {
      // `updateMany` filtré sur le projet : un identifiant d'une question
      // d'un autre projet ne touche rien, au lieu d'écrire chez quelqu'un
      // d'autre.
      await this.prisma.project_igini_questions.updateMany({
        where: { id: r.id, project_id: projectId },
        data: { reponse: r.reponse?.trim() || null },
      });
    }

    await this.prisma.project_questionnaires.upsert({
      where: { project_id: projectId },
      create: { project_id: projectId, termine_le: new Date() },
      update: { termine_le: new Date() },
    });

    this.logger.debug(`Questionnaire terminé pour le projet ${projectId}`);
    return this.vue(ownerId, projectId);
  }
}
