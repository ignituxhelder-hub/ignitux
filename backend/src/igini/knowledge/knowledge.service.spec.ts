import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { KnowledgeService } from './knowledge.service.js';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let prisma: {
    concepts: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    concept_links: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    projects: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      concepts: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
      concept_links: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
      projects: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [KnowledgeService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<KnowledgeService>(KnowledgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createConcept', () => {
    it('crée un concept sans projet', async () => {
      prisma.concepts.create.mockResolvedValue({ id: 'c1' });

      await service.createConcept('u1', 'Marché de niche');

      expect(prisma.concepts.create).toHaveBeenCalledWith({
        data: { user_id: 'u1', name: 'Marché de niche', description: undefined, category: undefined, project_id: null },
      });
    });

    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createConcept('u1', 'Concept', undefined, undefined, 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.concepts.create).not.toHaveBeenCalled();
    });
  });

  describe('link', () => {
    it("lève une NotFoundException si l'un des deux concepts n'appartient pas à l'utilisateur", async () => {
      prisma.concepts.findFirst.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce(null);

      await expect(service.link('u1', 'c1', 'c2', 'depend_de')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.concept_links.create).not.toHaveBeenCalled();
    });

    it('crée le lien une fois les deux concepts vérifiés', async () => {
      prisma.concepts.findFirst.mockResolvedValue({ id: 'c1', user_id: 'u1' });
      prisma.concept_links.create.mockResolvedValue({ id: 'l1' });

      await service.link('u1', 'c1', 'c2', 'depend_de');

      expect(prisma.concept_links.create).toHaveBeenCalledWith({
        data: { from_concept_id: 'c1', to_concept_id: 'c2', relation_type: 'depend_de' },
      });
    });
  });

  describe('listConcepts', () => {
    it('sans projectId, filtre par utilisateur (concepts personnels)', async () => {
      prisma.concepts.findMany.mockResolvedValue([]);

      await service.listConcepts('u1');

      expect(prisma.concepts.findMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        orderBy: { created_at: 'desc' },
      });
      expect(prisma.projects.findFirst).not.toHaveBeenCalled();
    });

    it("avec projectId, leve une NotFoundException si l'utilisateur n'a pas acces au projet", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listConcepts('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.concepts.findMany).not.toHaveBeenCalled();
    });

    it('avec projectId, un collaborateur voit les concepts du projet (pas seulement les siens)', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.concepts.findMany.mockResolvedValue([{ id: 'c1', user_id: 'u1' }]);

      const result = await service.listConcepts('u2', 'p1');

      expect(prisma.concepts.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'c1', user_id: 'u1' }]);
    });
  });

  describe('getGraph', () => {
    it("renvoie un graphe vide sans appeler concept_links si aucun concept n'existe", async () => {
      prisma.concepts.findMany.mockResolvedValue([]);

      const result = await service.getGraph('u1');

      expect(result).toEqual({ nodes: [], edges: [], isolated: [] });
      expect(prisma.concept_links.findMany).not.toHaveBeenCalled();
    });

    it('renvoie les nœuds et les arêtes internes au périmètre demandé', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.concepts.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      prisma.concept_links.findMany.mockResolvedValue([
        { id: 'l1', from_concept_id: 'c1', to_concept_id: 'c2' },
      ]);

      const result = await service.getGraph('u1', 'p1');

      expect(prisma.concept_links.findMany).toHaveBeenCalledWith({
        where: { from_concept_id: { in: ['c1', 'c2'] }, to_concept_id: { in: ['c1', 'c2'] } },
      });
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it('signale les concepts que rien ne relie', async () => {
      prisma.concepts.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
      prisma.concept_links.findMany.mockResolvedValue([
        { id: 'l1', from_concept_id: 'c1', to_concept_id: 'c2' },
      ]);

      const result = await service.getGraph('u1');

      expect(result.isolated).toEqual(['c3']);
    });
  });

  describe('searchConcepts', () => {
    it('exige tous les mots, dans le nom ou la description', async () => {
      prisma.concepts.findMany.mockResolvedValue([]);

      await service.searchConcepts('u1', { query: 'atelier mobile' });

      const where = prisma.concepts.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(2);
      expect(where.AND[0].OR).toEqual([
        { name: { contains: 'atelier', mode: 'insensitive' } },
        { description: { contains: 'atelier', mode: 'insensitive' } },
      ]);
    });

    it('filtre par catégorie', async () => {
      prisma.concepts.findMany.mockResolvedValue([]);

      await service.searchConcepts('u1', { category: 'marché' });

      expect(prisma.concepts.findMany.mock.calls[0][0].where.category).toBe('marché');
    });

    it("vérifie l'accès au projet avant de chercher dedans", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.searchConcepts('u2', { projectId: 'p1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.concepts.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listCategories', () => {
    it('renvoie les catégories utilisées, dédupliquées et triées, sans les vides', async () => {
      prisma.concepts.findMany.mockResolvedValue([
        { category: 'marché' },
        { category: 'technique' },
        { category: 'marché' },
        { category: null },
      ]);

      await expect(service.listCategories('u1')).resolves.toEqual(['marché', 'technique']);
    });
  });

  describe('getNeighbourhood', () => {
    beforeEach(() => {
      prisma.concepts.findFirst.mockResolvedValue({ id: 'c1', user_id: 'u1', project_id: null });
      prisma.concepts.findMany.mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3' },
        { id: 'c4' },
      ]);
      prisma.concept_links.findMany.mockResolvedValue([
        { id: 'l1', from_concept_id: 'c1', to_concept_id: 'c2' },
        { id: 'l2', from_concept_id: 'c2', to_concept_id: 'c3' },
      ]);
    });

    it('ne renvoie que les concepts atteignables à la profondeur demandée', async () => {
      const result = await service.getNeighbourhood('u1', 'c1', 1);

      expect(result.nodes.map((node) => node.id)).toEqual(['c1', 'c2']);
      expect(result.edges.map((edge) => edge.id)).toEqual(['l1']);
    });

    it('élargit le voisinage avec la profondeur', async () => {
      const result = await service.getNeighbourhood('u1', 'c1', 2);

      expect(result.nodes.map((node) => node.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it('plafonne la profondeur renvoyée', async () => {
      const result = await service.getNeighbourhood('u1', 'c1', 50);

      expect(result.depth).toBe(3);
    });

    it("refuse un concept qui n'appartient pas à l'appelant", async () => {
      prisma.concepts.findFirst.mockResolvedValue(null);

      await expect(service.getNeighbourhood('u2', 'c1', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findPath', () => {
    beforeEach(() => {
      prisma.concepts.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, user_id: 'u1', project_id: null }),
      );
      prisma.concepts.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
    });

    it('renvoie les concepts du chemin dans l\'ordre', async () => {
      prisma.concept_links.findMany.mockResolvedValue([
        { id: 'l1', from_concept_id: 'c1', to_concept_id: 'c2' },
        { id: 'l2', from_concept_id: 'c2', to_concept_id: 'c3' },
      ]);

      const result = await service.findPath('u1', 'c1', 'c3');

      expect(result.path?.map((concept) => concept?.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it("renvoie path: null quand aucun lien ne relie les deux concepts", async () => {
      prisma.concept_links.findMany.mockResolvedValue([]);

      const result = await service.findPath('u1', 'c1', 'c3');

      expect(result.path).toBeNull();
    });
  });

  describe('suppressions', () => {
    it("refuse de supprimer un concept qui n'appartient pas à l'appelant", async () => {
      prisma.concepts.findFirst.mockResolvedValue(null);

      await expect(service.deleteConcept('u2', 'c1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.concepts.delete).not.toHaveBeenCalled();
    });

    it('supprime un concept de son propriétaire', async () => {
      prisma.concepts.findFirst.mockResolvedValue({ id: 'c1', user_id: 'u1' });

      await service.deleteConcept('u1', 'c1');

      expect(prisma.concepts.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('refuse de supprimer un lien introuvable', async () => {
      prisma.concept_links.findFirst.mockResolvedValue(null);

      await expect(service.unlink('u1', 'l1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse de supprimer le lien d'un autre utilisateur", async () => {
      prisma.concept_links.findFirst.mockResolvedValue({ id: 'l1', from_concept_id: 'c1' });
      prisma.concepts.findFirst.mockResolvedValue(null);

      await expect(service.unlink('u2', 'l1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.concept_links.delete).not.toHaveBeenCalled();
    });

    it('supprime un lien du propriétaire', async () => {
      prisma.concept_links.findFirst.mockResolvedValue({ id: 'l1', from_concept_id: 'c1' });
      prisma.concepts.findFirst.mockResolvedValue({ id: 'c1', user_id: 'u1' });

      await service.unlink('u1', 'l1');

      expect(prisma.concept_links.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });
  });
});
