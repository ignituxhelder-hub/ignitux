import { Injectable, NotFoundException } from '@nestjs/common';
import { assertHasProjectAccess } from '../../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../../prisma/assert-owns-project.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MEMORY_CATEGORIES, type MemoryCategory } from './memory-category.js';

export interface MemorySearchFilters {
  query?: string;
  projectId?: string;
  category?: MemoryCategory;
  tags?: string[];
}

/**
 * Ordre de priorité des catégories pour le rappel contextuel.
 *
 * Une décision prise par le porteur pèse plus lourd qu'une préférence
 * d'affichage quand il s'agit de nourrir une génération : rappeler « il a
 * décidé de ne pas ouvrir le samedi » change une recommandation, rappeler
 * « il aime les listes courtes » ne la change pas. Cet ordre est un choix
 * de conception assumé, pas une mesure — il est écrit ici pour pouvoir être
 * discuté plutôt que caché dans un tri.
 */
const RECALL_PRIORITY: Record<MemoryCategory, number> = {
  decision: 0,
  learning: 1,
  fact: 2,
  preference: 3,
};

/**
 * Nombre de souvenirs injectés par défaut dans le contexte d'une génération.
 * Plafonné : au-delà, le contexte noie le prompt et coûte des jetons sans
 * rien ajouter d'utile.
 */
export const DEFAULT_RECALL_LIMIT = 12;

/**
 * MEMORY — le premier moteur du cerveau IGINI : retenir ce qu'IGINI apprend
 * de l'utilisateur et de ses projets (décisions, préférences, apprentissages,
 * faits), pour que cette expérience nourrisse les étapes suivantes plutôt que
 * de se perdre à chaque session.
 *
 * `recall()` est ce qui rend ce moteur autre chose qu'un carnet de notes :
 * c'est par lui que les souvenirs entrent réellement dans les prompts des
 * générateurs. Sans lui, IGINI mémorisait consciencieusement des choses
 * qu'il n'utilisait jamais.
 */
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async remember(
    userId: string,
    category: MemoryCategory,
    content: string,
    projectId?: string,
    tags: string[] = [],
  ) {
    if (projectId) {
      await assertOwnsProject(this.prisma, userId, projectId);
    }

    return this.prisma.memories.create({
      data: {
        user_id: userId,
        category,
        content,
        tags: this.normalizeTags(tags),
        project_id: projectId ?? null,
      },
    });
  }

  /**
   * Sans projectId : uniquement les souvenirs personnels de l'appelant (rien
   * à vérifier, c'est intrinsèquement privé). Avec projectId : les souvenirs
   * de CE projet quel qu'en soit l'auteur, dès lors que l'appelant y a accès
   * (propriétaire ou collaborateur) — pas seulement les siens, sinon un
   * collaborateur ne verrait jamais les souvenirs du propriétaire liés au
   * projet partagé, ce qui viderait le moteur Mémoire de son intérêt pour lui.
   *
   * La recherche textuelle exige que TOUS les mots de la requête soient
   * présents, chacun pouvant se trouver n'importe où. « client fidèle »
   * ramène donc un souvenir disant « le client revient, fidèle depuis
   * 2019 » — ce qu'une recherche sur la chaîne entière manquait.
   */
  async search(userId: string, filters: MemorySearchFilters = {}) {
    if (filters.projectId) {
      await assertHasProjectAccess(this.prisma, userId, filters.projectId);
    }

    const terms = this.splitTerms(filters.query);
    const tags = this.normalizeTags(filters.tags ?? []);

    return this.prisma.memories.findMany({
      where: {
        ...(filters.projectId ? { project_id: filters.projectId } : { user_id: userId }),
        ...(filters.category ? { category: filters.category } : {}),
        ...(tags.length > 0 ? { tags: { hasEvery: tags } } : {}),
        ...(terms.length > 0
          ? { AND: terms.map((term) => ({ content: { contains: term, mode: 'insensitive' as const } })) }
          : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Rappel contextuel : les souvenirs les plus utiles pour nourrir une
   * génération sur ce projet. Purement déterministe (aucun appel IA, aucun
   * embedding) — on préfère un tri explicable à une pertinence magique
   * qu'on ne saurait ni justifier ni déboguer.
   *
   * Inclut les souvenirs rattachés au projet ET les souvenirs personnels non
   * rattachés du propriétaire : une préférence de travail énoncée une fois
   * vaut pour tous ses projets, pas seulement pour celui où elle a été dite.
   */
  async recall(userId: string, projectId: string, limit = DEFAULT_RECALL_LIMIT) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const memories = await this.prisma.memories.findMany({
      where: {
        OR: [{ project_id: projectId }, { user_id: userId, project_id: null }],
      },
      orderBy: { created_at: 'desc' },
    });

    return memories
      .sort((left, right) => {
        const byPriority =
          this.priorityOf(left.category) - this.priorityOf(right.category);
        if (byPriority !== 0) return byPriority;
        // À priorité égale, le plus récent d'abord : une décision de la
        // semaine dernière prime sur une décision d'il y a six mois.
        return (right.created_at?.getTime() ?? 0) - (left.created_at?.getTime() ?? 0);
      })
      .slice(0, limit);
  }

  /**
   * Bloc de contexte prêt à être injecté dans un prompt, ou `undefined` si
   * rien n'est mémorisé. Renvoyer une chaîne vide ferait croire au
   * générateur qu'il dispose d'un contexte alors qu'il n'en a aucun.
   */
  async recallAsContext(
    userId: string,
    projectId: string,
    limit = DEFAULT_RECALL_LIMIT,
  ): Promise<string | undefined> {
    const memories = await this.recall(userId, projectId, limit);
    if (memories.length === 0) {
      return undefined;
    }

    const lines = memories.map((memory) => `- [${memory.category}] ${memory.content}`);
    return `Ce que tu sais déjà de cette personne et de ce projet (mémoire IGINI) :\n${lines.join('\n')}`;
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

  async forget(userId: string, memoryId: string) {
    // Seul l'auteur d'un souvenir peut l'effacer, même sur un projet
    // partagé : un collaborateur qui pourrait supprimer les souvenirs du
    // porteur réécrirait son histoire (article 8).
    const memory = await this.prisma.memories.findFirst({
      where: { id: memoryId, user_id: userId },
    });
    if (!memory) {
      throw new NotFoundException('Souvenir introuvable.');
    }

    await this.prisma.memories.delete({ where: { id: memoryId } });
  }

  /** Les étiquettes réellement utilisées, pour alimenter un filtre côté interface. */
  async listTags(userId: string, projectId?: string): Promise<string[]> {
    const memories = await this.search(userId, { projectId });
    const tags = new Set(memories.flatMap((memory) => memory.tags));
    return [...tags].sort((left, right) => left.localeCompare(right, 'fr'));
  }

  /**
   * Résumé déterministe (pas d'appel à Claude ici — volontairement gratuit)
   * des souvenirs enregistrés : nombre par catégorie et les plus récents.
   */
  async summarize(userId: string, projectId?: string): Promise<string> {
    const memories = await this.search(userId, { projectId });
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

  private priorityOf(category: string): number {
    // Une catégorie inconnue (donnée ancienne, migration) passe en dernier
    // plutôt que de faire planter le tri.
    return RECALL_PRIORITY[category as MemoryCategory] ?? Number.MAX_SAFE_INTEGER;
  }

  private splitTerms(query?: string): string[] {
    if (!query) return [];
    return query
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
  }

  private normalizeTags(tags: string[]): string[] {
    const normalized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(normalized)];
  }
}
