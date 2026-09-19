import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from './prisma.service.js';

/**
 * Vérifie qu'un projet est accessible en lecture par cet utilisateur —
 * propriétaire OU collaborateur (voir project_collaborators) — sinon lève une
 * NotFoundException. Même logique que ProjectsService.findOneForViewer,
 * dupliquée ici pour que les moteurs IGINI (memory, knowledge, workflow,
 * scoring) n'aient pas besoin de dépendre de ProjectsService.
 *
 * À ne jamais utiliser pour une écriture (créer/modifier/supprimer) — ça
 * reste `assertOwnsProject`, strictement réservé au propriétaire.
 */
export async function assertHasProjectAccess(
  prisma: PrismaService,
  userId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.projects.findFirst({
    where: {
      id: projectId,
      OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }],
    },
  });
  if (!project) {
    throw new NotFoundException('Projet introuvable.');
  }
}
