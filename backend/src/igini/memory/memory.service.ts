import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../../prisma/assert-owns-project.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MEMORY_CATEGORIES, type MemoryCategory } from './memory-category.js';

/**
 * MEMORY — le premier moteur du cerveau IGINI : retenir ce qu'IGINI apprend
 * de l'utilisateur et de ses projets (décisions, préférences, apprentissages,
 * faits), pour que cette expérience nourrisse les étapes suivantes plutôt que
 * de se perdre à chaque session.
 */
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async remember(userId: string, category: MemoryCategory, content: string, projectId?: string) {
    if (projectId) {
      await assertOwnsProject(this.prisma, userId, projectId);
    }

    return this.prisma.memories.create({
      data: {
        user_id: userId,
        category,
        content,
        project_id: projectId ?? null,
      },
    });
  }

  search(userId: string, query?: string, projectId?: string) {
    return this.prisma.memories.findMany({
      where: {
        user_id: userId,
        ...(projectId ? { project_id: projectId } : {}),
        ...(query ? { content: { contains: query, mode: 'insensitive' } } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async linkToProject(userId: string, memoryId: string, projectId: string) {
    const memory = await this.prisma.memories.findFirst({
      where: { id: memoryId, user_id: userId },
    });
    if (!memory) {
      throw new NotFoundException('Souvenir introuvable.');
    }

    // Le projet cible doit aussi appartenir à l'utilisateur, sinon on
    // pourrait rattacher un souvenir au projet de quelqu'un d'autre.
    await assertOwnsProject(this.prisma, userId, projectId);

    return this.prisma.memories.update({
      where: { id: memoryId },
      data: { project_id: projectId },
    });
  }

  /**
   * Résumé déterministe (pas d'appel à Claude ici — volontairement gratuit)
   * des souvenirs enregistrés : nombre par catégorie et les plus récents.
   */
  async summarize(userId: string, projectId?: string): Promise<string> {
    const memories = await this.search(userId, undefined, projectId);
    if (memories.length === 0) {
      return "Aucun souvenir enregistré pour l'instant.";
    }

    const counts = MEMORY_CATEGORIES.map((category) => ({
      category,
      count: memories.filter((memory) => memory.category === category).length,
    })).filter((entry) => entry.count > 0);
    const countsLine = counts.map((entry) => `${entry.count} ${entry.category}(s)`).join(', ');

    const recent = memories
      .slice(0, 5)
      .map((memory) => `- ${memory.content}`)
      .join('\n');

    return `${memories.length} souvenir(s) au total (${countsLine}). Les plus récents :\n${recent}`;
  }
}
