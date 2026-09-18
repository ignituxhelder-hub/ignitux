import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalysisService } from '../igini/analysis/analysis.service.js';
import { DevelopmentService } from '../igini/development/development.service.js';
import { FinancingService } from '../igini/financing/financing.service.js';
import { PlanningService } from '../igini/planning/planning.service.js';
import { TransmissionService } from '../igini/transmission/transmission.service.js';
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
  ) {}

  create(ownerId: string, title: string, description?: string) {
    return this.prisma.projects.create({
      data: { owner_id: ownerId, title, description },
    });
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.projects.findMany({
      where: { owner_id: ownerId },
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

  private joinContext(...parts: Array<string | undefined>): string | undefined {
    const present = parts.filter((part): part is string => Boolean(part));
    return present.length > 0 ? present.join('\n') : undefined;
  }

  async analyzeForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const result = await this.analysisService.analyzeProject(project.title, project.description);

    const analysis = await this.prisma.analyses.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        feasibility_score: result.feasibility_score,
        strengths: result.strengths,
        risks: result.risks,
        next_steps: result.next_steps,
      },
    });

    // Workflow : les prochaines étapes suggérées par l'analyse deviennent des
    // tâches suivables, pas juste du texte affiché puis oublié.
    await this.workflowService.createTasksFromSuggestions(project.id, result.next_steps, 'analysis');

    return analysis;
  }

  async listAnalysesForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.analyses.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createBuildPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const context = this.joinContext(await this.latestAnalysisContext(id));
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
      },
    });

    // Workflow : les jalons du plan de construction deviennent des tâches
    // suivables.
    await this.workflowService.createTasksFromSuggestions(project.id, result.milestones, 'build_plan');

    return buildPlan;
  }

  async listBuildPlansForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.build_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createFinancingPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [analysis, buildPlan] = await Promise.all([
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
    ]);
    const context = this.joinContext(analysis, buildPlan);
    const result = await this.financingService.createFinancingPlan(
      project.title,
      project.description,
      context,
    );

    return this.prisma.financing_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        estimated_budget: result.estimated_budget,
        funding_sources: result.funding_sources,
        budget_breakdown: result.budget_breakdown,
      },
    });
  }

  async listFinancingPlansForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.financing_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createDevelopmentPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [analysis, buildPlan, financingPlan] = await Promise.all([
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.latestFinancingPlanContext(id),
    ]);
    const context = this.joinContext(analysis, buildPlan, financingPlan);
    const result = await this.developmentService.createDevelopmentPlan(
      project.title,
      project.description,
      context,
    );

    return this.prisma.development_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        growth_levers: result.growth_levers,
        key_metrics: result.key_metrics,
        scaling_risks: result.scaling_risks,
      },
    });
  }

  async listDevelopmentPlansForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.development_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  async createTransmissionPlanForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const [analysis, buildPlan, financingPlan, developmentPlan] = await Promise.all([
      this.latestAnalysisContext(id),
      this.latestBuildPlanContext(id),
      this.latestFinancingPlanContext(id),
      this.latestDevelopmentPlanContext(id),
    ]);
    const context = this.joinContext(analysis, buildPlan, financingPlan, developmentPlan);
    const result = await this.transmissionService.createTransmissionPlan(
      project.title,
      project.description,
      context,
    );

    return this.prisma.transmission_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        transfer_options: result.transfer_options,
        key_documentation: result.key_documentation,
        readiness_checklist: result.readiness_checklist,
      },
    });
  }

  async listTransmissionPlansForOwner(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.transmission_plans.findMany({
      where: { project_id: id },
      orderBy: { created_at: 'desc' },
    });
  }
}
