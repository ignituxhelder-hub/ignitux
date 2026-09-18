import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * COMMUNAUTÉ — la partie IGNITUX (pas IGINI) qui permet à un porteur de
 * projet de rendre son projet visible aux autres utilisateurs, et de
 * recevoir des encouragements. Volontairement minimal : pas de messagerie
 * privée, pas de mise en relation avec des mentors/investisseurs, pas de
 * classement — juste de la visibilité et des encouragements, en attendant
 * une vraie spec pour aller plus loin.
 */
@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  listPublicProjects() {
    return this.prisma.projects.findMany({
      where: { is_public: true },
      select: { id: true, title: true, description: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async getPublicProject(id: string) {
    const project = await this.prisma.projects.findFirst({
      where: { id, is_public: true },
      select: { id: true, title: true, description: true, created_at: true },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }
    return project;
  }

  private async assertProjectIsPublic(projectId: string): Promise<void> {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, is_public: true },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable.');
    }
  }

  async listComments(projectId: string) {
    await this.assertProjectIsPublic(projectId);
    return this.prisma.community_comments.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
  }

  async addComment(authorId: string, projectId: string, content: string) {
    await this.assertProjectIsPublic(projectId);
    return this.prisma.community_comments.create({
      data: { project_id: projectId, author_id: authorId, content },
    });
  }
}
