import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
