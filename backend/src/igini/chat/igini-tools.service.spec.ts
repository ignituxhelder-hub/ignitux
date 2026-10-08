import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from '../memory/memory.service.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IginiToolsService } from './igini-tools.service.js';

describe('IginiToolsService', () => {
  let service: IginiToolsService;
  let prisma: { projects: { findMany: ReturnType<typeof vi.fn> } };
  let memory: { search: ReturnType<typeof vi.fn> };
  let projects: {
    analyzeForOwner: ReturnType<typeof vi.fn>;
    createBuildPlanForOwner: ReturnType<typeof vi.fn>;
    createFinancingPlanForOwner: ReturnType<typeof vi.fn>;
    createDevelopmentPlanForOwner: ReturnType<typeof vi.fn>;
    createTransmissionPlanForOwner: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = { projects: { findMany: vi.fn() } };
    memory = { search: vi.fn() };
    projects = {
      analyzeForOwner: vi.fn(),
      createBuildPlanForOwner: vi.fn(),
      createFinancingPlanForOwner: vi.fn(),
      createDevelopmentPlanForOwner: vi.fn(),
      createTransmissionPlanForOwner: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IginiToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MemoryService, useValue: memory },
        { provide: ProjectsService, useValue: projects },
      ],
    }).compile();

    service = module.get<IginiToolsService>(IginiToolsService);
  });

  describe('lister_projets', () => {
    it("ne renvoie que les projets du bon propriétaire", async () => {
      prisma.projects.findMany.mockResolvedValue([{ id: 'p1', title: 'Boulangerie', sector: 'Alimentation' }]);

      const result = await service.execute('lister_projets', {}, { userId: 'u1' });

      expect(prisma.projects.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { owner_id: 'u1' } }),
      );
      expect(result).toEqual({
        content: JSON.stringify([{ id: 'p1', title: 'Boulangerie', sector: 'Alimentation' }]),
        isError: false,
      });
    });
  });

  describe('rappeler_souvenirs', () => {
    it('transmet project_id et categorie à MemoryService.search', async () => {
      memory.search.mockResolvedValue([{ id: 'm1', content: 'Souvenir' }]);

      await service.execute('rappeler_souvenirs', { project_id: 'p1', categorie: 'decision' }, { userId: 'u1' });

      expect(memory.search).toHaveBeenCalledWith('u1', { projectId: 'p1', category: 'decision' });
    });

    it('fonctionne sans aucune entrée (souvenirs personnels, toutes catégories)', async () => {
      memory.search.mockResolvedValue([]);

      const result = await service.execute('rappeler_souvenirs', {}, { userId: 'u1' });

      expect(memory.search).toHaveBeenCalledWith('u1', { projectId: undefined, category: undefined });
      expect(result.isError).toBe(false);
    });
  });

  describe('outils générateurs', () => {
    it('analyser appelle ProjectsService.analyzeForOwner avec le bon projet', async () => {
      projects.analyzeForOwner.mockResolvedValue({ id: 'a1', feasibility_score: 7 });

      const result = await service.execute('analyser', { project_id: 'p1' }, { userId: 'u1' });

      expect(projects.analyzeForOwner).toHaveBeenCalledWith('u1', 'p1');
      expect(result).toEqual({ content: JSON.stringify({ id: 'a1', feasibility_score: 7 }), isError: false });
    });

    it("transforme une ForbiddenException (offre insuffisante) en tool_result d'erreur, sans planter", async () => {
      projects.createBuildPlanForOwner.mockRejectedValue(
        new ForbiddenException({ message: 'Ton offre n’inclut pas ce générateur.' }),
      );

      const result = await service.execute('construire', { project_id: 'p1' }, { userId: 'u1' });

      expect(result).toEqual({ content: 'Ton offre n’inclut pas ce générateur.', isError: true });
    });

    it('transforme une NotFoundException (projet inconnu) en tool_result d’erreur', async () => {
      projects.analyzeForOwner.mockRejectedValue(new NotFoundException('Projet introuvable.'));

      const result = await service.execute('analyser', { project_id: 'inexistant' }, { userId: 'u1' });

      expect(result).toEqual({ content: 'Projet introuvable.', isError: true });
    });

    it("renvoie une erreur de validation sans planter quand project_id est absent", async () => {
      const result = await service.execute('financer', {}, { userId: 'u1' });

      expect(result.isError).toBe(true);
      expect(projects.createFinancingPlanForOwner).not.toHaveBeenCalled();
    });
  });

  it('renvoie une erreur pour un nom d’outil inconnu, sans planter', async () => {
    const result = await service.execute('supprimer_tout', {}, { userId: 'u1' });

    expect(result.isError).toBe(true);
  });
});
