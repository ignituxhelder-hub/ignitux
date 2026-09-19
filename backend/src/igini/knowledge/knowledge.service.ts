import { Injectable, NotFoundException } from '@nestjs/common';
import { assertHasProjectAccess } from '../../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../../prisma/assert-owns-project.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * KNOWLEDGE — le deuxième moteur du cerveau IGINI : relier les idées, les
 * projets et les concepts entre eux, pour construire progressivement un
 * graphe de connaissance plutôt que des projets isolés.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async createConcept(
    userId: string,
    name: string,
    description?: string,
    category?: string,
    projectId?: string,
  ) {
    if (projectId) {
      await assertOwnsProject(this.prisma, userId, projectId);
    }

    return this.prisma.concepts.create({
      data: {
        user_id: userId,
        name,
        description,
        category,
        project_id: projectId ?? null,
      },
    });
  }

  /**
   * Sans projectId : uniquement les concepts personnels de l'appelant. Avec
   * projectId : les concepts de CE projet quel qu'en soit l'auteur, dès lors
   * que l'appelant y a accès (propriétaire ou collaborateur) — même logique
   * que MemoryService.search, voir son commentaire pour le détail.
   */
  async listConcepts(userId: string, projectId?: string) {
    if (projectId) {
      await assertHasProjectAccess(this.prisma, userId, projectId);
    }

    return this.prisma.concepts.findMany({
      where: projectId ? { project_id: projectId } : { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async link(userId: string, fromConceptId: string, toConceptId: string, relationType: string) {
    const [fromConcept, toConcept] = await Promise.all([
      this.prisma.concepts.findFirst({ where: { id: fromConceptId, user_id: userId } }),
      this.prisma.concepts.findFirst({ where: { id: toConceptId, user_id: userId } }),
    ]);
    if (!fromConcept || !toConcept) {
      throw new NotFoundException('Concept introuvable.');
    }

    return this.prisma.concept_links.create({
      data: { from_concept_id: fromConceptId, to_concept_id: toConceptId, relation_type: relationType },
    });
  }

  /**
   * Le graphe (nœuds + arêtes) des concepts de l'utilisateur, optionnellement
   * restreint à un projet. Format simple, prêt pour une future visualisation
   * côté frontend (pas de layout ici, juste les données).
   */
  async getGraph(userId: string, projectId?: string) {
    const nodes = await this.listConcepts(userId, projectId);
    const nodeIds = nodes.map((node) => node.id);

    const edges =
      nodeIds.length > 0
        ? await this.prisma.concept_links.findMany({
            where: {
              from_concept_id: { in: nodeIds },
              to_concept_id: { in: nodeIds },
            },
          })
        : [];

    return { nodes, edges };
  }
}
