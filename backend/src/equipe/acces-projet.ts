import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { estRoleEquipe, peutFaire, ROLE_LABEL, type Capacite, type Role } from './droits-equipe.js';

/**
 * L'ACCÈS À UN PROJET — un seul point pour toute l'application.
 *
 * Le rôle est relu en base à chaque appel : un changement de rôle s'applique
 * à la requête suivante, sans cache de droits à invalider.
 *
 * Sans accès : 404, pour ne pas révéler qu'un projet existe. Avec accès mais
 * un rôle insuffisant : 403, avec une phrase qui dit ce que le rôle ne permet
 * pas — la personne sait alors que ce n'est pas une panne.
 */
export interface AccesProjet {
  role: Role;
  /** Le propriétaire : c'est à lui qu'on attribue un appel IGINI lancé par un associé. */
  ownerId: string;
}

const ACTION: Record<Capacite, string> = {
  voir_projet: 'voir ce projet',
  voir_plan_financement: 'voir le plan de financement',
  modifier_projet: 'modifier le projet',
  voir_taches: 'voir les tâches',
  modifier_taches: 'modifier les tâches',
  voir_conformite_memoire: 'voir la conformité et la mémoire du projet',
  modifier_conformite_memoire: 'modifier la conformité et la mémoire du projet',
  lancer_ia: 'lancer IGINI sur ce projet',
  demander_evaluation: 'demander une évaluation de financement',
  voir_evaluation: 'voir l’évaluation de financement',
  voir_financement: 'voir le financement du projet',
  modifier_financement: 'modifier le financement du projet',
  voir_documents_juridiques: 'voir les documents juridiques',
  actes_juridiques: 'faire un acte juridique (statuts, dépôt, mandat)',
  gerer_equipe: 'gérer l’équipe',
  supprimer_projet: 'supprimer le projet',
};

export async function accesProjet(
  prisma: Pick<PrismaService, 'projects'>,
  userId: string,
  projectId: string,
): Promise<AccesProjet> {
  const projet = await prisma.projects.findFirst({
    where: {
      id: projectId,
      OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }],
    },
    select: { owner_id: true, collaborators: { where: { user_id: userId }, select: { role: true } } },
  });
  if (!projet) throw new NotFoundException('Projet introuvable.');
  if (projet.owner_id === userId) return { role: 'proprietaire', ownerId: projet.owner_id };
  const brut = projet.collaborators[0]?.role ?? 'observateur';
  // Un rôle inconnu en base n'ouvre jamais plus que la lecture.
  return { role: estRoleEquipe(brut) ? brut : 'observateur', ownerId: projet.owner_id };
}

export async function exigerCapacite(
  prisma: Pick<PrismaService, 'projects'>,
  userId: string,
  projectId: string,
  capacite: Capacite,
): Promise<AccesProjet> {
  const acces = await accesProjet(prisma, userId, projectId);
  if (!peutFaire(acces.role, capacite)) {
    throw new ForbiddenException(
      `Ton rôle sur ce projet (${ROLE_LABEL[acces.role]}) ne permet pas de ${ACTION[capacite]}.`,
    );
  }
  return acces;
}
