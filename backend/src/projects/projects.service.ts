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
    const result = await this.planningService.createBuildPlan(project.title, project.description);

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
    const result = await this.financingService.createFinancingPlan(
      project.title,
      project.description,
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
    const result = await this.developmentService.createDevelopmentPlan(
      project.title,
      project.description,
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
    const result = await this.transmissionService.createTransmissionPlan(
      project.title,
      project.description,
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
