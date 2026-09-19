import { Injectable, NotFoundException } from '@nestjs/common';
import { assertHasProjectAccess } from '../../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../../prisma/assert-owns-project.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  collectNeighbourhood,
  findIsolated,
  findShortestPath,
  MAX_TRAVERSAL_DEPTH,
} from './concept-graph.js';

export interface ConceptSearchFilters {
  query?: string;
  category?: string;
  projectId?: string;
}

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
   * Recherche dans les concepts. Même convention que MemoryService.search :
   * tous les mots de la requête doivent être présents, chacun pouvant se
   * trouver dans le nom OU dans la description.
   */
  async searchConcepts(userId: string, filters: ConceptSearchFilters = {}) {
    if (filters.projectId) {
      await assertHasProjectAccess(this.prisma, userId, filters.projectId);
    }

    const terms = (filters.query ?? '')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    return this.prisma.concepts.findMany({
      where: {
        ...(filters.projectId ? { project_id: filters.projectId } : { user_id: userId }),
        ...(filters.category ? { category: filters.category } : {}),
        ...(terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { description: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Les catégories réellement utilisées, pour alimenter un filtre. */
  async listCategories(userId: string, projectId?: string): Promise<string[]> {
    const concepts = await this.listConcepts(userId, projectId);
    const categories = new Set(
      concepts.map((concept) => concept.category).filter((category): category is string =>
        Boolean(category),
      ),
    );
    return [...categories].sort((left, right) => left.localeCompare(right, 'fr'));
  }

  /**
   * Le graphe (nœuds + arêtes) des concepts de l'utilisateur, optionnellement
   * restreint à un projet. Format simple, prêt pour une future visualisation
   * côté frontend (pas de layout ici, juste les données).
   *
   * `isolated` accompagne le graphe : un concept que rien ne relie n'est
   * pas une anomalie, c'est souvent une idée pas encore rattachée — mais
   * elle disparaît visuellement au milieu des autres, donc on la nomme.
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

    return { nodes, edges, isolated: findIsolated(nodeIds, edges) };
  }

  /**
   * Sous-graphe autour d'un concept : ce qui est atteignable en au plus
   * `depth` sauts. C'est la lecture utile quand le graphe entier est trop
   * dense pour qu'on y distingue quoi que ce soit.
   */
  async getNeighbourhood(userId: string, conceptId: string, depth = 1) {
    const concept = await this.findConceptForUser(userId, conceptId);
    const { nodes, edges } = await this.getGraph(userId, concept.project_id ?? undefined);

    const reachable = collectNeighbourhood(conceptId, edges, depth);

    return {
      center: concept,
      depth: Math.max(0, Math.min(depth, MAX_TRAVERSAL_DEPTH)),
      nodes: nodes.filter((node) => reachable.has(node.id)),
      edges: edges.filter(
        (edge) => reachable.has(edge.from_concept_id) && reachable.has(edge.to_concept_id),
      ),
    };
  }

  /**
   * Le plus court chemin entre deux concepts. Renvoie `path: null` quand
   * il n'y en a pas — dire « aucun lien connu » est une réponse, en
   * fabriquer un serait une invention.
   */
  async findPath(userId: string, fromConceptId: string, toConceptId: string) {
    const [from, to] = await Promise.all([
      this.findConceptForUser(userId, fromConceptId),
      this.findConceptForUser(userId, toConceptId),
    ]);

    const { nodes, edges } = await this.getGraph(userId, from.project_id ?? undefined);
    const ids = findShortestPath(fromConceptId, toConceptId, edges);
    if (!ids) {
      return { from, to, path: null };
    }

    const byId = new Map(nodes.map((node) => [node.id, node]));
    return { from, to, path: ids.map((id) => byId.get(id)).filter(Boolean) };
  }

  async deleteConcept(userId: string, conceptId: string) {
    await this.findConceptForUser(userId, conceptId);
    // Les liens partent en cascade (onDelete: Cascade dans le schéma) :
    // laisser des arêtes pointant vers un concept disparu produirait un
    // graphe qui ment sur ce qu'il contient.
    await this.prisma.concepts.delete({ where: { id: conceptId } });
  }

  async unlink(userId: string, linkId: string) {
    const link = await this.prisma.concept_links.findFirst({ where: { id: linkId } });
    if (!link) {
      throw new NotFoundException('Lien introuvable.');
    }
    // Vérifier un seul des deux bouts suffit : `link` n'a pu être créé que
    // si les deux concepts appartenaient au même utilisateur.
    await this.findConceptForUser(userId, link.from_concept_id);

    await this.prisma.concept_links.delete({ where: { id: linkId } });
  }

  private async findConceptForUser(userId: string, conceptId: string) {
    const concept = await this.prisma.concepts.findFirst({
      where: { id: conceptId, user_id: userId },
    });
    if (!concept) {
      throw new NotFoundException('Concept introuvable.');
    }
    return concept;
  }
}
