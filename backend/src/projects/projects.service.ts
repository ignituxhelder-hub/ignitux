import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service.js';
import { DevelopmentService } from '../development/development.service.js';
import { FinancingService } from '../financing/financing.service.js';
import { PlanningService } from '../planning/planning.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransmissionService } from '../transmission/transmission.service.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
    private readonly planningService: PlanningService,
    private readonly financingService: FinancingService,
    private readonly developmentService: DevelopmentService,
    private readonly transmissionService: TransmissionService,
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

  /**
   * Résume ce qu'IGINI sait déjà d'un projet grâce aux étapes précédentes
   * (mémoire commune) : la dernière analyse, le dernier plan de
   * construction et le dernier plan de financement, quand ils existent.
   * Utilisé pour que chaque nouvelle génération s'appuie sur les
   * précédentes plutôt que de repartir de zéro.
   */
  private async buildProjectContext(projectId: string): Promise<string | undefined> {
    const [latestAnalysis, latestBuildPlan, latestFinancingPlan, latestDevelopmentPlan] =
      await Promise.all([
        this.prisma.analyses.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.build_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.financing_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.development_plans.findFirst({
          where: { project_id: projectId },
          orderBy: { created_at: 'desc' },
        }),
      ]);

    const parts: string[] = [];
    if (latestAnalysis) {
      parts.push(
        `Analyse (score de faisabilité ${latestAnalysis.feasibility_score}/10) : ${latestAnalysis.summary}`,
      );
    }
    if (latestBuildPlan) {
      parts.push(`Plan de construction : ${latestBuildPlan.summary}`);
    }
    if (latestFinancingPlan) {
      parts.push(`Plan de financement : ${latestFinancingPlan.summary}`);
    }
    if (latestDevelopmentPlan) {
      parts.push(`Plan de développement : ${latestDevelopmentPlan.summary}`);
    }

    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  async analyzeForOwner(ownerId: string, id: string) {
    const project = await this.findOneForOwner(ownerId, id);
    const result = await this.analysisService.analyzeProject(project.title, project.description);

    return this.prisma.analyses.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        feasibility_score: result.feasibility_score,
        strengths: result.strengths,
        risks: result.risks,
        next_steps: result.next_steps,
      },
    });
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
    const context = await this.buildProjectContext(id);
    const result = await this.planningService.createBuildPlan(
      project.title,
      project.description,
      context,
    );

    return this.prisma.build_plans.create({
      data: {
        project_id: project.id,
        summary: result.summary,
        estimated_timeline: result.estimated_timeline,
        milestones: result.milestones,
        key_resources: result.key_resources,
      },
    });
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
    const context = await this.buildProjectContext(id);
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
    const context = await this.buildProjectContext(id);
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
    const context = await this.buildProjectContext(id);
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
