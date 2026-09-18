import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from './prisma.service.js';

/**
 * Vérifie qu'un projet appartient bien à l'utilisateur, sinon lève une
 * NotFoundException — même contrôle que ProjectsService.findOneForOwner,
 * dupliqué ici pour que les moteurs IGINI (memory, knowledge, workflow,
 * scoring) n'aient pas besoin de dépendre de ProjectsService pour une simple
 * vérification de propriété.
 */
export async function assertOwnsProject(
  prisma: PrismaService,
  userId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.projects.findFirst({
    where: { id: projectId, owner_id: userId },
  });
  if (!project) {
    throw new NotFoundException('Projet introuvable.');
  }
}
