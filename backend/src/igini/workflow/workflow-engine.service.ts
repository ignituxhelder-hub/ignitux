import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConstitutionService } from '../../constitution/constitution.service.js';
import { assertHasProjectAccess } from '../../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../../prisma/assert-owns-project.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  evaluateCondition,
  isActionType,
  isConditionType,
  PROJECT_STAGES,
  type ProjectSnapshot,
  type ProjectStage,
} from './workflow-conditions.js';
import { findTemplate, WORKFLOW_TEMPLATES } from './workflow-templates.js';

export interface WorkflowStepInput {
  title: string;
  description?: string;
  conditionType: string;
  conditionValue?: string | null;
  actionType: string;
  actionValue?: string | null;
}

export interface AdvanceResult {
  run: { id: string; status: string; current_position: number };
  /** Étapes franchies pendant cet appel, dans l'ordre. */
  stepsCompleted: Array<{ position: number; title: string; reason: string }>;
  /** Pourquoi on s'est arrêté là, ou null si le processus est terminé. */
  blockedReason: string | null;
  tasksCreated: Array<{ id: string; title: string }>;
}

/**
 * WORKFLOW ENGINE — l'exécution des processus.
 *
 * Il complète WorkflowService (les tâches) sans le remplacer : les tâches
 * restent l'unité de travail, le moteur décrit l'enchaînement. La séparation
 * est volontaire — fusionner les deux aurait fait d'une simple liste de
 * tâches un objet de processus, avec une migration lourde pour un gain nul.
 *
 * Deux garanties portent tout le reste :
 *
 * 1. Le moteur n'invente jamais un franchissement. Une condition qu'il ne
 *    sait pas évaluer bloque l'exécution au lieu de la laisser passer.
 * 2. Il n'appelle jamais l'IA. Comme AutomationService, il ne travaille que
 *    sur les données déjà présentes — un processus qui déclencherait des
 *    générations en cascade pourrait épuiser le budget sans qu'un humain
 *    le voie venir.
 */
@Injectable()
export class WorkflowEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitutionService: ConstitutionService,
  ) {}

  listTemplates() {
    return WORKFLOW_TEMPLATES.map((template) => ({
      slug: template.slug,
      name: template.name,
      description: template.description,
      stepCount: template.steps.length,
    }));
  }

  async createFromTemplate(userId: string, projectId: string, slug: string) {
    await assertOwnsProject(this.prisma, userId, projectId);

    const template = findTemplate(slug);
    if (!template) {
      throw new NotFoundException('Modèle de processus introuvable.');
    }

    return this.prisma.workflow_definitions.create({
      data: {
        project_id: projectId,
        name: template.name,
        description: template.description,
        steps: {
          create: template.steps.map((step, index) => ({
            position: index,
            title: step.title,
            description: step.description,
            condition_type: step.conditionType,
            condition_value: step.conditionValue,
            action_type: step.actionType,
            action_value: step.actionValue,
          })),
        },
      },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
  }

  async createWorkflow(
    userId: string,
    projectId: string,
    name: string,
    description: string | undefined,
    steps: WorkflowStepInput[],
  ) {
    await assertOwnsProject(this.prisma, userId, projectId);

    if (steps.length === 0) {
      throw new BadRequestException('Un processus doit comporter au moins une étape.');
    }

    for (const step of steps) {
      this.assertStepIsExecutable(step);
    }

    return this.prisma.workflow_definitions.create({
      data: {
        project_id: projectId,
        name,
        description,
        steps: {
          create: steps.map((step, index) => ({
            position: index,
            title: step.title,
            description: step.description,
            condition_type: step.conditionType,
            condition_value: step.conditionValue ?? null,
            action_type: step.actionType,
            action_value: step.actionValue ?? null,
          })),
        },
      },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
  }

  // Lecture seule : un collaborateur peut consulter les processus du projet.
  async listWorkflows(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    return this.prisma.workflow_definitions.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'asc' },
      include: {
        steps: { orderBy: { position: 'asc' } },
        runs: { orderBy: { started_at: 'desc' } },
      },
    });
  }

  async deleteWorkflow(userId: string, workflowId: string) {
    const workflow = await this.findWorkflowForOwner(userId, workflowId);
    await this.prisma.workflow_definitions.delete({ where: { id: workflow.id } });
  }

  /**
   * Démarre une exécution. Une seule exécution active par processus : deux
   * exécutions concurrentes du même processus sur le même projet
   * produiraient des tâches en double sans qu'on sache laquelle fait foi.
   */
  async startRun(userId: string, workflowId: string): Promise<AdvanceResult> {
    const workflow = await this.findWorkflowForOwner(userId, workflowId);

    const active = await this.prisma.workflow_runs.findFirst({
      where: { workflow_id: workflowId, status: { in: ['running', 'blocked'] } },
    });
    if (active) {
      throw new BadRequestException('Une exécution de ce processus est déjà en cours.');
    }

    const run = await this.prisma.workflow_runs.create({
      data: { workflow_id: workflowId, project_id: workflow.project_id },
    });

    return this.advanceRun(userId, run.id);
  }

  /**
   * Fait avancer une exécution aussi loin que l'état réel du projet le
   * permet, puis s'arrête sur la première condition non satisfaite.
   */
  async advanceRun(userId: string, runId: string): Promise<AdvanceResult> {
    const run = await this.prisma.workflow_runs.findFirst({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Exécution introuvable.');
    }
    await assertOwnsProject(this.prisma, userId, run.project_id);

    const [steps, snapshot] = await Promise.all([
      this.prisma.workflow_steps.findMany({
        where: { workflow_id: run.workflow_id },
        orderBy: { position: 'asc' },
      }),
      this.buildSnapshot(run.project_id, run.id),
    ]);

    const stepsCompleted: AdvanceResult['stepsCompleted'] = [];
    const tasksCreated: AdvanceResult['tasksCreated'] = [];
    let position = run.current_position;
    let blockedReason: string | null = null;

    while (position < steps.length) {
      const step = steps[position];
      const verdict = evaluateCondition(
        {
          position: step.position,
          type: isConditionType(step.condition_type) ? step.condition_type : 'manual',
          value: step.condition_value,
        },
        snapshot,
      );

      if (!verdict.satisfied) {
        blockedReason = verdict.reason;
        break;
      }

      const created = await this.runStepAction(run.id, run.project_id, step);
      if (created) {
        tasksCreated.push(created);
      }

      stepsCompleted.push({ position: step.position, title: step.title, reason: verdict.reason });
      await this.journal(run.id, step.position, 'step_completed', `${step.title} — ${verdict.reason}`);
      position += 1;
    }

    const completed = position >= steps.length;
    if (completed) {
      await this.journal(run.id, position, 'run_completed', 'Processus terminé.');
    } else if (blockedReason !== null && stepsCompleted.length > 0) {
      // On ne journalise le blocage que s'il suit une progression : sinon
      // chaque consultation d'un processus en attente empilerait une ligne
      // identique et noierait le journal.
      await this.journal(run.id, position, 'blocked', blockedReason);
    }

    const updated = await this.prisma.workflow_runs.update({
      where: { id: run.id },
      data: {
        current_position: position,
        status: completed ? 'completed' : blockedReason !== null ? 'blocked' : 'running',
        completed_at: completed ? new Date() : null,
      },
    });

    // Article 5 : le moteur franchit des étapes et crée des tâches sans
    // confirmation préalable. Sa légitimité tient au journal — on le
    // vérifie sur le fait accompli, pas sur l'intention.
    await this.constitutionService.guard(
      {
        kind: 'autonomous_act',
        engine: 'workflow',
        journalled: stepsCompleted.length === 0 || (await this.hasEvents(run.id)),
      },
      { userId, projectId: run.project_id },
    );

    return {
      run: { id: updated.id, status: updated.status, current_position: updated.current_position },
      stepsCompleted,
      blockedReason,
      tasksCreated,
    };
  }

  /**
   * Validation humaine d'une étape `manual`. C'est le seul point où une
   * exécution avance parce qu'une personne l'a décidé, et non parce que les
   * données l'ont permis.
   */
  async confirmStep(userId: string, runId: string, position: number): Promise<AdvanceResult> {
    const run = await this.prisma.workflow_runs.findFirst({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Exécution introuvable.');
    }
    await assertOwnsProject(this.prisma, userId, run.project_id);

    if (run.current_position !== position) {
      throw new BadRequestException(
        "Cette étape n'est pas celle en attente : valider une étape à l'avance reviendrait à approuver ce qui n'a pas encore été fait.",
      );
    }

    await this.journal(run.id, position, 'manual_confirmed', 'Étape validée manuellement.');
    return this.advanceRun(userId, runId);
  }

  async listEvents(userId: string, runId: string) {
    const run = await this.prisma.workflow_runs.findFirst({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Exécution introuvable.');
    }
    await assertHasProjectAccess(this.prisma, userId, run.project_id);

    return this.prisma.workflow_events.findMany({
      where: { run_id: runId },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Fait avancer toutes les exécutions actives d'un projet. Appelé après
   * une génération : c'est ce qui rend les processus réactifs sans qu'on
   * ait à cliquer quoi que ce soit.
   */
  async advanceActiveRunsForProject(userId: string, projectId: string): Promise<void> {
    const runs = await this.prisma.workflow_runs.findMany({
      where: { project_id: projectId, status: { in: ['running', 'blocked'] } },
    });

    for (const run of runs) {
      await this.advanceRun(userId, run.id);
    }
  }

  private async runStepAction(
    runId: string,
    projectId: string,
    step: { position: number; action_type: string; action_value: string | null },
  ): Promise<{ id: string; title: string } | null> {
    if (!isActionType(step.action_type) || step.action_type === 'none') {
      return null;
    }
    const title = step.action_value?.trim();
    if (!title) {
      return null;
    }

    // Idempotence : réavancer une exécution ne doit pas recréer une tâche
    // déjà créée par cette même étape. Sans ce garde-fou, chaque génération
    // sur le projet dupliquerait les tâches de toutes les étapes franchies.
    const existing = await this.prisma.tasks.findFirst({
      where: { project_id: projectId, title, source: 'workflow' },
    });
    if (existing) {
      return null;
    }

    const task = await this.prisma.tasks.create({
      data: { project_id: projectId, title, assignee: 'human', source: 'workflow' },
    });
    await this.journal(runId, step.position, 'task_created', `Tâche créée : ${title}`);
    return { id: task.id, title: task.title };
  }

  private async buildSnapshot(projectId: string, runId: string): Promise<ProjectSnapshot> {
    const [analysis, buildPlan, financingPlan, developmentPlan, transmissionPlan, tasks, confirmations] =
      await Promise.all([
        this.prisma.analyses.count({ where: { project_id: projectId } }),
        this.prisma.build_plans.count({ where: { project_id: projectId } }),
        this.prisma.financing_plans.count({ where: { project_id: projectId } }),
        this.prisma.development_plans.count({ where: { project_id: projectId } }),
        this.prisma.transmission_plans.count({ where: { project_id: projectId } }),
        this.prisma.tasks.findMany({
          where: { project_id: projectId },
          select: { source: true, status: true },
        }),
        this.prisma.workflow_events.findMany({
          where: { run_id: runId, type: 'manual_confirmed' },
          select: { step_position: true },
        }),
      ]);

    const counts: Record<ProjectStage, number> = {
      analysis,
      build_plan: buildPlan,
      financing_plan: financingPlan,
      development_plan: developmentPlan,
      transmission_plan: transmissionPlan,
    };

    return {
      existingStages: new Set(PROJECT_STAGES.filter((stage) => counts[stage] > 0)),
      tasks,
      manuallyConfirmedPositions: new Set(
        confirmations.map((confirmation) => confirmation.step_position),
      ),
    };
  }

  private journal(runId: string, position: number, type: string, detail: string) {
    return this.prisma.workflow_events.create({
      data: { run_id: runId, step_position: position, type, detail },
    });
  }

  private async hasEvents(runId: string): Promise<boolean> {
    return (await this.prisma.workflow_events.count({ where: { run_id: runId } })) > 0;
  }

  private async findWorkflowForOwner(userId: string, workflowId: string) {
    const workflow = await this.prisma.workflow_definitions.findFirst({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Processus introuvable.');
    }
    await assertOwnsProject(this.prisma, userId, workflow.project_id);
    return workflow;
  }

  private assertStepIsExecutable(step: WorkflowStepInput): void {
    if (!isConditionType(step.conditionType)) {
      throw new BadRequestException(`Condition inconnue : « ${step.conditionType} ».`);
    }
    if (!isActionType(step.actionType)) {
      throw new BadRequestException(`Action inconnue : « ${step.actionType} ».`);
    }
    // Une condition qui exige une valeur mais n'en a pas produirait une
    // étape définitivement bloquée. Mieux vaut refuser à la création que
    // laisser l'utilisateur découvrir le blocage à l'exécution.
    if (
      (step.conditionType === 'stage_exists' || step.conditionType === 'tasks_done') &&
      !step.conditionValue
    ) {
      throw new BadRequestException(
        `La condition « ${step.conditionType} » exige une valeur (sinon l'étape resterait bloquée indéfiniment).`,
      );
    }
    if (step.actionType === 'create_task' && !step.actionValue?.trim()) {
      throw new BadRequestException("L'action « create_task » exige un intitulé de tâche.");
    }
  }
}
