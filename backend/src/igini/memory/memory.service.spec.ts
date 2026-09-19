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
    };
    projects: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      memories: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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
        data: { user_id: 'u1', category: 'preference', content: 'Préfère un ton direct', project_id: null },
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
        data: { user_id: 'u1', category: 'decision', content: 'A choisi X', project_id: 'p1' },
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

      await expect(service.search('u2', undefined, 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.memories.findMany).not.toHaveBeenCalled();
    });

    it('avec projectId, un collaborateur voit les souvenirs du projet (pas seulement les siens)', async () => {
      // Le projet appartient à u1, mais u2 (collaborateur) y a accès.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.memories.findMany.mockResolvedValue([{ id: 'm1', user_id: 'u1' }]);

      const result = await service.search('u2', undefined, 'p1');

      expect(prisma.memories.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'm1', user_id: 'u1' }]);
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
