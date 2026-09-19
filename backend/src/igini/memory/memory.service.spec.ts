import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MemoryService } from './memory.service.js';

describe('MemoryService', () => {
  let service: MemoryService;
  let prisma: {
    memories: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    projects: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      memories: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      projects: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MemoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('remember', () => {
    it('enregistre un souvenir sans projet', async () => {
      prisma.memories.create.mockResolvedValue({ id: 'm1' });

      await service.remember('u1', 'preference', 'Préfère un ton direct');

      expect(prisma.memories.create).toHaveBeenCalledWith({
        data: {
          user_id: 'u1',
          category: 'preference',
          content: 'Préfère un ton direct',
          tags: [],
          project_id: null,
        },
      });
      expect(prisma.projects.findFirst).not.toHaveBeenCalled();
    });

    it("lève une NotFoundException si le projet lié n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.remember('u1', 'decision', 'A choisi X', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.memories.create).not.toHaveBeenCalled();
    });

    it('enregistre un souvenir lié à un projet possédé', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.memories.create.mockResolvedValue({ id: 'm1' });

      await service.remember('u1', 'decision', 'A choisi X', 'p1');

      expect(prisma.memories.create).toHaveBeenCalledWith({
        data: {
          user_id: 'u1',
          category: 'decision',
          content: 'A choisi X',
          tags: [],
          project_id: 'p1',
        },
      });
    });
  });

  describe('linkToProject', () => {
    it("lève une NotFoundException si le souvenir n'appartient pas à l'utilisateur", async () => {
      prisma.memories.findFirst.mockResolvedValue(null);

      await expect(service.linkToProject('u1', 'm1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lève une NotFoundException si le projet cible n'appartient pas à l'utilisateur", async () => {
      prisma.memories.findFirst.mockResolvedValue({ id: 'm1', user_id: 'u1' });
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.linkToProject('u1', 'm1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.memories.update).not.toHaveBeenCalled();
    });

    it('relie le souvenir au projet une fois les deux propriétés vérifiées', async () => {
      prisma.memories.findFirst.mockResolvedValue({ id: 'm1', user_id: 'u1' });
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.memories.update.mockResolvedValue({ id: 'm1', project_id: 'p1' });

      await service.linkToProject('u1', 'm1', 'p1');

      expect(prisma.memories.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { project_id: 'p1' },
      });
    });
  });

  describe('search', () => {
    it('sans projectId, filtre par utilisateur (souvenirs personnels)', async () => {
      prisma.memories.findMany.mockResolvedValue([]);

      await service.search('u1');

      expect(prisma.memories.findMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        orderBy: { created_at: 'desc' },
      });
      expect(prisma.projects.findFirst).not.toHaveBeenCalled();
    });

    it("avec projectId, leve une NotFoundException si l'utilisateur n'a pas acces au projet", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.search('u2', { projectId: 'p1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.memories.findMany).not.toHaveBeenCalled();
    });

    it('avec projectId, un collaborateur voit les souvenirs du projet (pas seulement les siens)', async () => {
      // Le projet appartient à u1, mais u2 (collaborateur) y a accès.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.memories.findMany.mockResolvedValue([{ id: 'm1', user_id: 'u1' }]);

      const result = await service.search('u2', { projectId: 'p1' });

      expect(prisma.memories.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'm1', user_id: 'u1' }]);
    });
  });

  describe('search — filtres', () => {
    it('exige que tous les mots de la requête soient présents, pas la chaîne entière', async () => {
      prisma.memories.findMany.mockResolvedValue([]);

      await service.search('u1', { query: 'client  fidèle' });

      const where = prisma.memories.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { content: { contains: 'client', mode: 'insensitive' } },
        { content: { contains: 'fidèle', mode: 'insensitive' } },
      ]);
    });

    it('filtre par catégorie', async () => {
      prisma.memories.findMany.mockResolvedValue([]);

      await service.search('u1', { category: 'decision' });

      expect(prisma.memories.findMany.mock.calls[0][0].where.category).toBe('decision');
    });

    it('exige toutes les étiquettes demandées, normalisées en minuscules', async () => {
      prisma.memories.findMany.mockResolvedValue([]);

      await service.search('u1', { tags: ['  Local ', 'BUDGET', 'local'] });

      expect(prisma.memories.findMany.mock.calls[0][0].where.tags).toEqual({
        hasEvery: ['local', 'budget'],
      });
    });

    it("n'ajoute aucun filtre quand rien n'est demandé", async () => {
      prisma.memories.findMany.mockResolvedValue([]);

      await service.search('u1');

      const where = prisma.memories.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeUndefined();
      expect(where.tags).toBeUndefined();
      expect(where.category).toBeUndefined();
    });
  });

  describe('recall', () => {
    const projet = { id: 'p1', owner_id: 'u1' };

    it("vérifie l'accès au projet avant de rappeler quoi que ce soit", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.recall('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('inclut les souvenirs du projet ET les souvenirs personnels non rattachés', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet);
      prisma.memories.findMany.mockResolvedValue([]);

      await service.recall('u1', 'p1');

      expect(prisma.memories.findMany.mock.calls[0][0].where).toEqual({
        OR: [{ project_id: 'p1' }, { user_id: 'u1', project_id: null }],
      });
    });

    it('classe les décisions avant les préférences, puis du plus récent au plus ancien', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet);
      prisma.memories.findMany.mockResolvedValue([
        { category: 'preference', content: 'Ton direct', created_at: new Date('2026-05-01') },
        { category: 'decision', content: 'Décision ancienne', created_at: new Date('2026-01-01') },
        { category: 'fact', content: 'Fait', created_at: new Date('2026-06-01') },
        { category: 'decision', content: 'Décision récente', created_at: new Date('2026-04-01') },
      ]);

      const recalled = await service.recall('u1', 'p1');

      expect(recalled.map((memory) => memory.content)).toEqual([
        'Décision récente',
        'Décision ancienne',
        'Fait',
        'Ton direct',
      ]);
    });

    it('plafonne le nombre de souvenirs rappelés', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet);
      prisma.memories.findMany.mockResolvedValue(
        Array.from({ length: 30 }, (_, index) => ({
          category: 'fact',
          content: `Fait ${index}`,
          created_at: new Date('2026-01-01'),
        })),
      );

      await expect(service.recall('u1', 'p1', 5)).resolves.toHaveLength(5);
    });

    it('ne fait pas planter le tri sur une catégorie inconnue', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet);
      prisma.memories.findMany.mockResolvedValue([
        { category: 'categorie-disparue', content: 'Ancien', created_at: new Date('2026-01-01') },
        { category: 'decision', content: 'Décision', created_at: new Date('2026-01-01') },
      ]);

      const recalled = await service.recall('u1', 'p1');

      expect(recalled.map((memory) => memory.content)).toEqual(['Décision', 'Ancien']);
    });
  });

  describe('recallAsContext', () => {
    it("renvoie undefined quand rien n'est mémorisé, pas une chaîne vide", async () => {
      // Une chaîne vide ferait croire au générateur qu'il a du contexte.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.memories.findMany.mockResolvedValue([]);

      await expect(service.recallAsContext('u1', 'p1')).resolves.toBeUndefined();
    });

    it('produit un bloc lisible, catégorie par souvenir', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.memories.findMany.mockResolvedValue([
        { category: 'decision', content: 'Ne pas ouvrir le samedi', created_at: new Date() },
      ]);

      const context = await service.recallAsContext('u1', 'p1');

      expect(context).toContain('mémoire IGINI');
      expect(context).toContain('- [decision] Ne pas ouvrir le samedi');
    });
  });

  describe('forget', () => {
    it("refuse d'effacer un souvenir dont l'appelant n'est pas l'auteur", async () => {
      // Article 8 : un collaborateur ne réécrit pas l'histoire du porteur.
      prisma.memories.findFirst.mockResolvedValue(null);

      await expect(service.forget('u2', 'm1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.memories.delete).not.toHaveBeenCalled();
    });

    it('efface le souvenir de son auteur', async () => {
      prisma.memories.findFirst.mockResolvedValue({ id: 'm1', user_id: 'u1' });

      await service.forget('u1', 'm1');

      expect(prisma.memories.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });

  describe('listTags', () => {
    it('renvoie les étiquettes réellement utilisées, dédupliquées et triées', async () => {
      prisma.memories.findMany.mockResolvedValue([
        { tags: ['budget', 'local'] },
        { tags: ['local', 'atelier'] },
        { tags: [] },
      ]);

      await expect(service.listTags('u1')).resolves.toEqual(['atelier', 'budget', 'local']);
    });
  });

  describe('summarize', () => {
    it("renvoie un message par défaut s'il n'y a aucun souvenir", async () => {
      prisma.memories.findMany.mockResolvedValue([]);

      await expect(service.summarize('u1')).resolves.toBe("Aucun souvenir enregistré pour l'instant.");
    });

    it('résume les souvenirs par catégorie sans appeler Claude', async () => {
      prisma.memories.findMany.mockResolvedValue([
        { category: 'decision', content: 'A choisi X' },
        { category: 'decision', content: 'A choisi Y' },
        { category: 'preference', content: 'Préfère un ton direct' },
      ]);

      const summary = await service.summarize('u1');

      expect(summary).toContain('3 souvenir(s) au total');
      expect(summary).toContain('2 decision(s)');
      expect(summary).toContain('1 preference(s)');
      expect(summary).toContain('A choisi X');
    });
  });
});
