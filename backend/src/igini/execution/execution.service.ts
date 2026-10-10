import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceService } from '../../compliance/compliance.service.js';
import type { project_compliance_ai_runs } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AutomationService } from '../automation/automation.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';
import {
  ExecutionConformiteSchema,
  ExecutionResultSchema,
  formaterConformite,
  formaterResultat,
} from './execution-schema.js';
import { promptExigence, promptTache } from './execution-prompts.js';

/** Statuts IA possibles d'un résultat (tâche ou exigence). */
type StatutIa = 'a_valider' | 'valide' | 'refuse' | 'echec';

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, on te confie une tâche du projet. Si le travail est
rédigeable (texte, brouillon, tableau, message), fais-le réellement et renvoie-le comme livrable.
Si la personne doit agir elle-même (démarche en ligne, signature, paiement, rendez-vous), renvoie
des instructions avec des étapes précises et ordonnées. N'invente jamais de référence légale
(article, numéro de loi, organisme) dont tu n'es pas certaine : dis plutôt qu'il faut la vérifier.`);

const SYSTEM_PROMPT_CONFORMITE = buildSystemPrompt(`Ici, on te confie une exigence de conformité du
projet. Commence TOUJOURS par ouvrir la page de la source avec l'outil web_fetch : c'est elle qui fait
foi, pas ta mémoire. Si un lien de cette page, sur le même site, est nécessaire pour répondre, tu peux
l'ouvrir aussi. Ensuite, à partir UNIQUEMENT de ce que tu as lu, résume ce que la source dit pour CE
projet, puis produis un brouillon prêt à déposer (formulaire, courrier, déclaration rédigée) et/ou la
liste ordonnée des démarches à faire. Si la page n'a pas pu être lue, dis-le dans le contenu et laisse
le résumé vide. N'affirme jamais que quelque chose a été déposé ou déclaré : c'est la personne qui le
fera. N'invente jamais de référence légale (article, numéro de loi, organisme) absente de la source :
dis plutôt qu'il faut la vérifier.`);

/**
 * Deux lectures : la fiche elle-même, plus une page liée quand la fiche
 * renvoie ailleurs pour le détail. Au-delà, c'est une recherche, pas une
 * lecture de source — et chaque page se paie en tokens.
 */
const LECTURES_MAX = 2;
/** Une fiche service-public tient largement dedans ; borne le coût d'une page géante. */
const TOKENS_MAX_PAR_PAGE = 20000;

export type ComplianceAiRun = project_compliance_ai_runs;

/** Idempotence : un résultat existe déjà, inutile de payer un second appel. */
function dejaExecute(aiStatus: string | null | undefined): boolean {
  return !!aiStatus && DEJA_EXECUTEES.includes(aiStatus);
}

/** Valider ou refuser n'a de sens que sur un résultat « à valider ». */
function exigerAValider(aiStatus: string | null | undefined, message: string): void {
  if (aiStatus !== 'a_valider') {
    throw new BadRequestException(message);
  }
}

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
    private readonly compliance: ComplianceService,
  ) {}

  async runTask(userId: string, projectId: string, taskId: string) {
    const { task, projet } = await this.getTask(userId, projectId, taskId);

    // Une tâche d'étape (créée par l'automatisation) se fait avec l'étape
    // elle-même ; la valider ferait recréer la même tâche.
    if (task.source === 'automation') {
      throw new BadRequestException(
        "Cette tâche se fait avec l'étape correspondante, pas avec « Faire faire par IGINI ».",
      );
    }

    if (dejaExecute(task.ai_status)) {
      return task;
    }

    const resultat = await this.appelerClaude(
      () =>
        this.claude.generateStructuredOutput({
          schema: ExecutionResultSchema,
          system: SYSTEM_PROMPT,
          userContent: promptTache(projet, task, task.ai_refusal_reason),
          logContext: "Échec de l'exécution d'une tâche via Claude",
          userErrorMessage: "L'exécution de la tâche a échoué, réessaie dans un instant.",
          usage: { userId, projectId, generator: 'executer' },
        }),
      () =>
        this.prisma.tasks.update({
          where: { id: taskId },
          data: { ai_status: 'echec', ai_run_at: new Date() },
        }),
    );

    // Hors du try : un échec d'enregistrement ne doit pas écrire « echec ».
    return this.prisma.tasks.update({
      where: { id: taskId },
      data: {
        ai_status: 'a_valider',
        ai_result_kind: resultat.kind,
        ai_result: formaterResultat(resultat),
        ai_refusal_reason: null,
        ai_run_at: new Date(),
      },
    });
  }

  async validateTask(userId: string, projectId: string, taskId: string) {
    const { task } = await this.getTask(userId, projectId, taskId);
    exigerAValider(task.ai_status, "Aucun résultat d'IGINI à valider pour cette tâche.");

    const misAJour = await this.prisma.tasks.update({
      where: { id: taskId },
      data: { status: 'done', ai_status: 'valide' },
    });
    // Une tâche terminée fait bouger les scores, comme un changement de statut.
    await this.automation.runAfterChange(projectId);
    return misAJour;
  }

  async refuseTask(userId: string, projectId: string, taskId: string, reason?: string) {
    const { task } = await this.getTask(userId, projectId, taskId);
    exigerAValider(task.ai_status, "Aucun résultat d'IGINI à refuser pour cette tâche.");
    // `status` n'est volontairement pas touché : refuser le résultat de l'IA
    // ne dit rien de l'avancement réel de la tâche.
    return this.prisma.tasks.update({
      where: { id: taskId },
      data: { ai_status: 'refuse', ai_refusal_reason: reason ?? null },
    });
  }

  // ---- Conformité : même logique, sur project_compliance_ai_runs ----

  async runCompliance(userId: string, projectId: string, requirementId: string): Promise<ComplianceAiRun> {
    const { exigence, run, projet } = await this.getCompliance(userId, projectId, requirementId);

    if (run && dejaExecute(run.status)) {
      return run;
    }

    const resultat = await this.appelerClaude(
      () =>
        this.claude.generateStructuredOutput({
          schema: ExecutionConformiteSchema,
          system: SYSTEM_PROMPT_CONFORMITE,
          userContent: promptExigence(projet, exigence, run?.refusal_reason),
          logContext: "Échec de l'exécution d'une exigence de conformité via Claude",
          userErrorMessage: "L'exécution de la démarche a échoué, réessaie dans un instant.",
          usage: { userId, projectId, generator: 'executer' },
          // Le site de la source, et lui seul : IGINI lit la fiche officielle
          // qu'on lui confie, il ne part pas chercher ailleurs.
          webFetch: {
            allowedDomains: [new URL(exigence.source_url).hostname],
            maxUses: LECTURES_MAX,
            maxContentTokens: TOKENS_MAX_PAR_PAGE,
          },
        }),
      () => this.saveCompliance(projectId, requirementId, { status: 'echec' }),
    );

    // Hors du try : un échec d'enregistrement ne doit pas écrire « echec ».
    return this.saveCompliance(projectId, requirementId, {
      status: 'a_valider',
      result_kind: resultat.kind,
      result: formaterConformite(resultat, resultat.pagesLues, {
        name: exigence.source_name,
        url: exigence.source_url,
      }),
      refusal_reason: null,
    });
  }

  async validateCompliance(userId: string, projectId: string, requirementId: string): Promise<ComplianceAiRun> {
    const { run } = await this.getCompliance(userId, projectId, requirementId);
    exigerAValider(run?.status, "Aucun résultat d'IGINI à valider pour cette exigence.");
    await this.compliance.markChecked(userId, projectId, requirementId);
    return this.saveCompliance(projectId, requirementId, { status: 'valide' });
  }

  async refuseCompliance(
    userId: string,
    projectId: string,
    requirementId: string,
    reason?: string,
  ): Promise<ComplianceAiRun> {
    const { run } = await this.getCompliance(userId, projectId, requirementId);
    exigerAValider(run?.status, "Aucun résultat d'IGINI à refuser pour cette exigence.");
    // Rien n'est coché : refuser le brouillon ne dit rien de la démarche réelle.
    return this.saveCompliance(projectId, requirementId, {
      status: 'refuse',
      refusal_reason: reason ?? null,
    });
  }

  /**
   * Appel Claude commun aux tâches et à la conformité. Offre, quota, plafond de
   * coût, générateurs coupés (403/503) : rien n'a été tenté, on relance sans
   * rien écrire. Toute autre erreur appelle `onEchec` (qui écrit « echec »)
   * puis est relancée. Seul l'appel est dans le try : l'enregistrement du
   * résultat, fait par l'appelant, ne peut donc jamais écrire « echec ».
   */
  private async appelerClaude<R>(lancer: () => Promise<R>, onEchec: () => Promise<unknown>): Promise<R> {
    try {
      return await lancer();
    } catch (erreur) {
      const status = erreur instanceof HttpException ? erreur.getStatus() : undefined;
      if (status !== 403 && status !== 503) {
        await onEchec();
      }
      throw erreur;
    }
  }

  private saveCompliance(
    projectId: string,
    requirementId: string,
    data: { status: StatutIa; result_kind?: string; result?: string; refusal_reason?: string | null },
  ) {
    return this.prisma.project_compliance_ai_runs.upsert({
      where: { project_id_requirement_id: { project_id: projectId, requirement_id: requirementId } },
      update: data,
      create: { project_id: projectId, requirement_id: requirementId, ...data },
    });
  }

  /** Propriété du projet, exigence connue, puis l'éventuel run existant. */
  private async getCompliance(userId: string, projectId: string, requirementId: string) {
    const projet = await this.getProjet(userId, projectId);
    const exigence = await this.prisma.compliance_requirements.findUnique({
      where: { id: requirementId },
    });
    if (!exigence) {
      throw new NotFoundException('Exigence de conformité introuvable.');
    }
    const run = await this.prisma.project_compliance_ai_runs.findUnique({
      where: { project_id_requirement_id: { project_id: projectId, requirement_id: requirementId } },
    });
    return { exigence, run, projet };
  }

  /** Propriété du projet puis appartenance de la tâche, avant tout appel IA. */
  private async getTask(userId: string, projectId: string, taskId: string) {
    const projet = await this.getProjet(userId, projectId);
    const task = await this.prisma.tasks.findFirst({
      where: { id: taskId, project_id: projectId },
    });
    if (!task) {
      throw new NotFoundException('Tâche introuvable.');
    }
    return { task, projet };
  }

  /** Propriété du projet ; renvoie le projet pour nourrir le prompt. */
  private async getProjet(userId: string, projectId: string) {
    const projet = await this.prisma.projects.findFirst({
      where: { id: projectId, owner_id: userId },
    });
    if (!projet) {
      throw new NotFoundException('Projet introuvable.');
    }
    return projet;
  }
}
