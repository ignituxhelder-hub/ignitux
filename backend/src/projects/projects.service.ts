import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { AnalysisService } from '../igini/analysis/analysis.service.js';
import { CLAUDE_MODEL } from '../igini/claude/claude.service.js';
import { MemoryService } from '../igini/memory/memory.service.js';
import { AutomationService } from '../igini/automation/automation.service.js';
import { DevelopmentService } from '../igini/development/development.service.js';
import { FinancingService } from '../igini/financing/financing.service.js';
import { PlanningService } from '../igini/planning/planning.service.js';
import { TransmissionService } from '../igini/transmission/transmission.service.js';
import { WorkflowEngineService } from '../igini/workflow/workflow-engine.service.js';
import { WorkflowService } from '../igini/workflow/workflow.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
    private readonly planningService: PlanningService,
    private readonly financingService: FinancingService,
    private readonly developmentService: DevelopmentService,
    private readonly transmissionService: TransmissionService,
    private readonly workflowService: WorkflowService,
    private readonly automationService: AutomationService,
    private readonly constitutionService: ConstitutionService,
    private readonly memoryService: MemoryService,
    private readonly workflowEngineService: WorkflowEngineService,
  ) {}

  /**
   * Provenance commune aux cinq générateurs, soumise au moteur
   * constitutionnel avant l'écriture. Centralisée ici parce qu'une provenance
   * recopiée cinq fois finit par diverger, et qu'une divergence silencieuse
   * sur ce champ précis est exactement ce que l'article 12 interdit.
   */
  private async generatedProvenance(
    entity: string,
    ownerId: string,
    projectId: string,
  ): Promise<{ generated_by: string; generated_model: string }> {
    await this.constitutionService.guard(
      {
        kind: 'persist_generated',
        entity,
        generatedBy: 'igini',
        generatedModel: CLAUDE_MODEL,
      },
      { userId: ownerId, projectId },
    );

    return { generated_by: 'igini', generated_model: CLAUDE_MODEL };
  }

  async create(ownerId: string, title: string, description?: string) {
    // Article 13 (Respect de la Vie Privée) : un projet naît privé. La
    // règle attrape une régression où `is_public` prendrait `true` par
    // défaut — un basculement silencieux que personne ne remarquerait.
    await this.constitutionService.guard(
      { kind: 'create_project', isPublic: false },
      { userId: ownerId },
    );

    return this.prisma.projects.create({
      data: { owner_id: ownerId, title, description },
    });
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.projects.findMany({
      where: { OR: [{ owner_id: ownerId }, { collaborators: { some: { user_id: ownerId } } }] },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOneForOwner(ownerId: string, id: string) {
    const project = await this.prisma.projects.findFirst({
      where: { id, owner_id: ownerId },
    });

    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }

    return project;
  }

  // Un collaborateur peut consulter le projet, son historique généré par
  // IGINI, et les 4 moteurs transverses (lecture seule, voir
  // assertHasProjectAccess), mais pas modifier le projet, le supprimer,
  // changer sa visibilité, en ajouter/retirer un collaborateur, ni
  // déclencher une génération ou une automatisation — toutes ces actions
  // restent strictement réservées au propriétaire (findOneForOwner).
  async findOneForViewer(userId: string, id: string) {
    const project = await this.prisma.projects.findFirst({
      where: {
        id,
        OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }

    return project;
  }

  async updateForOwner(ownerId: string, id: string, title?: string, description?: string) {
    // Vérifie que le projet appartient bien à l'utilisateur avant de le modifier.
    await this.findOneForOwner(ownerId, id);

    return this.prisma.projects.update({
      where: { id },
      data: { title, description },
    });
  }

  async deleteForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    await this.prisma.projects.delete({ where: { id } });
  }

  async setVisibilityForOwner(ownerId: string, id: string, isPublic: boolean) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.projects.update({ where: { id }, data: { is_public: isPublic } });
  }

  async listCollaborators(userId: string, id: string) {
    await this.findOneForViewer(userId, id);
    return this.prisma.project_collaborators.findMany({
      where: { project_id: id },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  async addCollaborator(ownerId: string, id: string, email: string) {
    const project = await this.findOneForOwner(ownerId, id);

    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('Aucun compte ne correspond à cet email.');
    }
    if (user.id === project.owner_id) {
      throw new BadRequestException('Le propriétaire du projet ne peut pas être ajouté comme collaborateur.');
    }

    const existing = await this.prisma.project_collaborators.findFirst({
      where: { project_id: id, user_id: user.id },
    });
    if (existing) {
      throw new BadRequestException('Cette personne collabore déjà sur ce projet.');
    }

    return this.prisma.project_collaborators.create({
      data: { project_id: id, user_id: user.id },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  async removeCollaborator(ownerId: string, id: string, collaboratorUserId: string) {
    await this.findOneForOwner(ownerId, id);
    await this.prisma.project_collaborators.deleteMany({
      where: { project_id: id, user_id: collaboratorUserId },
    });
  }

  // Mémoire commune (voir backend/src/igini/README.md) : chaque génération ne
  // doit voir QUE ce que les étapes qui la précèdent logiquement ont déjà
  // établi — jamais ce qui vient après. Chaque étape a donc sa propre
  // méthode, appelée uniquement par les étapes qui la suivent dans le
  // pipeline (analyse → construction → financement → développement →
  // transmission), plutôt qu'une fonction unique qui remonterait tout sans
  // distinction (ce qui ferait fuir des informations "du futur" en cas de
  // régénération d'une étape après que des étapes suivantes existent déjà).

  private async latestAnalysisContext(projectId: string): Promise<string | undefined> {
    const analysis = await this.prisma.analyses.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return analysis
      ? `Analyse (score de faisabilité ${analysis.feasibility_score}/10) : ${analysis.summary}`
      : undefined;
  }

  private async latestBuildPlanContext(projectId: string): Promise<string | undefined> {
    const plan = await this.prisma.build_plans.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return plan ? `Plan de construction : ${plan.summary}` : undefined;
  }

  private async latestFinancingPlanContext(projectId: string): Promise<string | undefined> {
    const plan = await this.prisma.financing_plans.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return plan ? `Plan de financement : ${plan.summary}` : undefined;
  }

  private async latestDevelopmentPlanContext(projectId: string): Promise<string | undefined> {
    const plan = await this.prisma.development_plans.findFirst({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
    return plan ? `Plan de développement : ${plan.summary}` : undefined;
  }

  /**
   * Rappel de la mémoire IGINI, injecté dans le contexte de CHAQUE
   * génération — y compris la toute première analyse, qui n'a par
   * définition aucune étape précédente mais peut très bien porter sur une
   * personne dont IGINI sait déjà des choses.
   *
   * C'est ce branchement qui donne son sens au moteur Mémoire : jusqu'ici
   * il enregistrait consciencieusement des souvenirs que rien ne relisait
   * jamais.
   */
  private memoryContext(ownerId: string, projectId: string): Promise<string | undefined> {
    return this.memoryService.recallAsContext(ownerId, projectId);
  }

  private joinContext(...parts: Array<string | undefined>): string | undefined {
    const present = parts.filter((part): part is string => Boolean(part));
    return present.length > 0 ? present.join('\n') : undefined;
  }

  async analyzeForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const result = await this.analysisService.analyzeProject(
      project.title,
      project.description,
      await this.memoryContext(ownerId, id),
    );

    const analysis = await this.prisma.analyses.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        feasibility_score: result.feasibility_score,
        strengths: result.strengths,
        risks: result.risks,
        next_steps: result.next_steps,
        ...(await this.generatedProvenance('analyses', ownerId, project.id)),
      },
    });

    // Workflow : les prochaines étapes suggérées par l'analyse deviennent des
    // tâches suivables, pas juste du texte affiché puis oublié.
    await this.workflowService.createTasksFromSuggestions(project.id, result.next_steps, 'analysis');
    // Automation : sans confirmation, IGINI réévalue les tâches d'étape et
    // les liens de concepts du projet à chaud (voir AutomationService).
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return analysis;
  }

  async listAnalysesForOwner(ownerId: string, id: string) {
    await this.findOneForViewer(ownerId, id);
    return this.prisma.analyses.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createBuildPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [memory, analysis] = await Promise.all([
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
    ]);
    const context = this.joinContext(memory, analysis);
    const result = await this.planningService.createBuildPlan(
      project.title,
      project.description,
      context,
    );

    const buildPlan = await this.prisma.build_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        estimated_timeline: result.estimated_timeline,
        milestones: result.milestones,
        key_resources: result.key_resources,
        ...(await this.generatedProvenance('build_plans', ownerId, project.id)),
      },
    });

    // Workflow : les jalons du plan de construction deviennent des tâches
    // suivables.
    await this.workflowService.createTasksFromSuggestions(project.id, result.milestones, 'build_plan');
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return buildPlan;
  }

  async listBuildPlansForOwner(ownerId: string, id: string) {
    await this.findOneForViewer(ownerId, id);
    return this.prisma.build_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createFinancingPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [memory, analysis, buildPlan] = await Promise.all([
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
    ]);
    const context = this.joinContext(memory, analysis, buildPlan);
    const result = await this.financingService.createFinancingPlan(
      project.title,
      project.description,
      context,
    );

    const financingPlan = await this.prisma.financing_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        estimated_budget: result.estimated_budget,
        funding_sources: result.funding_sources,
        budget_breakdown: result.budget_breakdown,
        ...(await this.generatedProvenance('financing_plans', ownerId, project.id)),
      },
    });
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return financingPlan;
  }

  async listFinancingPlansForOwner(ownerId: string, id: string) {
    await this.findOneForViewer(ownerId, id);
    return this.prisma.financing_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createDevelopmentPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [memory, analysis, buildPlan, financingPlan] = await Promise.all([
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.latestFinancingPlanContext(id),
    ]);
    const context = this.joinContext(memory, analysis, buildPlan, financingPlan);
    const result = await this.developmentService.createDevelopmentPlan(
      project.title,
      project.description,
      context,
    );

    const developmentPlan = await this.prisma.development_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        growth_levers: result.growth_levers,
        key_metrics: result.key_metrics,
        scaling_risks: result.scaling_risks,
        ...(await this.generatedProvenance('development_plans', ownerId, project.id)),
      },
    });
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return developmentPlan;
  }

  async listDevelopmentPlansForOwner(ownerId: string, id: string) {
    await this.findOneForViewer(ownerId, id);
    return this.prisma.development_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createTransmissionPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [memory, analysis, buildPlan, financingPlan, developmentPlan] = await Promise.all([
      this.memoryContext(ownerId, id),
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.latestFinancingPlanContext(id),
      this.latestDevelopmentPlanContext(id),
    ]);
    const context = this.joinContext(
      memory,
      analysis,
      buildPlan,
      financingPlan,
      developmentPlan,
    );
    const result = await this.transmissionService.createTransmissionPlan(
      project.title,
      project.description,
      context,
    );

    const transmissionPlan = await this.prisma.transmission_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        transfer_options: result.transfer_options,
        key_documentation: result.key_documentation,
        readiness_checklist: result.readiness_checklist,
        ...(await this.generatedProvenance('transmission_plans', ownerId, project.id)),
      },
    });
    await this.automationService.run(project.id);
    await this.workflowEngineService.advanceActiveRunsForProject(ownerId, project.id);

    return transmissionPlan;
  }

  async listTransmissionPlansForOwner(ownerId: string, id: string) {
    await this.findOneForViewer(ownerId, id);
    return this.prisma.transmission_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  // Déclenchement manuel, pour un projet existant sans nouvelle génération —
  // exécute exactement la même logique que celle appelée automatiquement
  // après chaque génération (voir AutomationService).
  async runAutomationForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    return this.automationService.run(id);
  }

  // Lecture seule : accessible au propriétaire et aux collaborateurs, comme
  // les autres moteurs transverses.
  async listAutomationRunsForViewer(userId: string, id: string) {
    await this.findOneForViewer(userId, id);
    return this.automationService.listRuns(id);
  }
}
