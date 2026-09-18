import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
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
}
