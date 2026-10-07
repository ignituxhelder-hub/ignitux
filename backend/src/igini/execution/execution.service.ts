import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../../prisma/assert-owns-project.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AutomationService } from '../automation/automation.service.js';
import { buildProjectPrompt } from '../claude/build-project-prompt.js';
import { ClaudeService } from '../claude/claude.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';
import { ExecutionResultSchema } from './execution-schema.js';

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, on te confie une tâche du projet. Si le travail est
rédigeable (texte, brouillon, tableau, message), fais-le réellement et renvoie-le comme livrable.
Si la personne doit agir elle-même (démarche en ligne, signature, paiement, rendez-vous), renvoie
des instructions avec des étapes précises et ordonnées. N'invente jamais de référence légale
(article, numéro de loi, organisme) dont tu n'es pas certaine : dis plutôt qu'il faut la vérifier.`);

/** Statuts IA qui rendent un nouveau lancement inutile (résultat déjà là). */
const DEJA_EXECUTEES = ['a_valider', 'valide'];

/**
 * Fait exécuter une tâche par IGINI, sous supervision humaine : le résultat
 * reste « à valider » tant que la personne ne l'a pas acceptée, et seule la
 * validation fait passer la tâche à « done ».
 */
@Injectable()
export class ExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly automation: AutomationService,
  ) {}

  async runTask(userId: string, projectId: string, taskId: string) {
    const task = await this.getTask(userId, projectId, taskId);

    // Idempotence : un résultat existe déjà, inutile de payer un second appel.
    if (task.ai_status && DEJA_EXECUTEES.includes(task.ai_status)) {
      return task;
    }

    // Un motif de refus guide la nouvelle tentative, même si un échec est
    // intervenu entre-temps (refus -> échec -> relance garde le motif).
    const contexte = task.ai_refusal_reason
      ? `Une première version a été refusée par la personne. Motif : ${task.ai_refusal_reason}`
      : undefined;

    let resultat;
    try {
      resultat = await this.claude.generateStructuredOutput({
        schema: ExecutionResultSchema,
        system: SYSTEM_PROMPT,
        userContent: buildProjectPrompt(task.title, task.description, contexte),
        logContext: "Échec de l'exécution d'une tâche via Claude",
        userErrorMessage: "L'exécution de la tâche a échoué, réessaie dans un instant.",
        usage: { userId, projectId, generator: 'executer' },
      });
    } catch (erreur) {
      // Offre, quota, plafond de coût, générateurs coupés (403/503) : rien
      // n'a été tenté, la tâche reste « non traitée » et on ne l'écrit pas.
      const status = erreur instanceof HttpException ? erreur.getStatus() : undefined;
      if (status !== 403 && status !== 503) {
        await this.prisma.tasks.update({
          where: { id: taskId },
          data: { ai_status: 'echec', ai_run_at: new Date() },
        });
      }
      throw erreur;
    }

    const etapes = resultat.etapes?.length
      ? '\n\n' + resultat.etapes.map((etape, i) => `${i + 1}. ${etape}`).join('\n')
      : '';

    // Hors du try : un échec d'enregistrement ne doit pas écrire « echec ».
    return this.prisma.tasks.update({
      where: { id: taskId },
      data: {
        ai_status: 'a_valider',
        ai_result_kind: resultat.kind,
        ai_result: `${resultat.contenu}${etapes}`,
        ai_refusal_reason: null,
        ai_run_at: new Date(),
      },
    });
  }

  async validateTask(userId: string, projectId: string, taskId: string) {
    const task = await this.getTask(userId, projectId, taskId);
    if (task.ai_status !== 'a_valider') {
      throw new BadRequestException("Aucun résultat d'IGINI à valider pour cette tâche.");
    }

    const misAJour = await this.prisma.tasks.update({
      where: { id: taskId },
      data: { status: 'done', ai_status: 'valide' },
    });
    // Une tâche terminée fait bouger les scores, comme un changement de statut.
    await this.automation.runAfterChange(projectId);
    return misAJour;
  }

  async refuseTask(userId: string, projectId: string, taskId: string, reason?: string) {
    const task = await this.getTask(userId, projectId, taskId);
    if (task.ai_status !== 'a_valider') {
      throw new BadRequestException("Aucun résultat d'IGINI à refuser pour cette tâche.");
    }
    // `status` n'est volontairement pas touché : refuser le résultat de l'IA
    // ne dit rien de l'avancement réel de la tâche.
    return this.prisma.tasks.update({
      where: { id: taskId },
      data: { ai_status: 'refuse', ai_refusal_reason: reason ?? null },
    });
  }

  /** Propriété du projet puis appartenance de la tâche, avant tout appel IA. */
  private async getTask(userId: string, projectId: string, taskId: string) {
    await assertOwnsProject(this.prisma, userId, projectId);
    const task = await this.prisma.tasks.findFirst({
      where: { id: taskId, project_id: projectId },
    });
    if (!task) {
      throw new NotFoundException('Tâche introuvable.');
    }
    return task;
  }
}
