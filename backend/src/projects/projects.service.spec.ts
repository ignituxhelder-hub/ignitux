import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../analysis/analysis.service.js';
import { PlanningService } from '../planning/planning.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: {
    projects: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    analyses: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    build_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let analysisService: { analyzeProject: ReturnType<typeof vi.fn> };
  let planningService: { createBuildPlan: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      analyses: { create: vi.fn(), findMany: vi.fn() },
      build_plans: { create: vi.fn(), findMany: vi.fn() },
    };
    analysisService = { analyzeProject: vi.fn() };
    planningService = { createBuildPlan: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalysisService, useValue: analysisService },
        { provide: PlanningService, useValue: planningService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create scope le projet au propriétaire', async () => {
    prisma.projects.create.mockResolvedValue({ id: 'p1', owner_id: 'u1', title: 'Idée' });

    await service.create('u1', 'Idée', 'Description');

    expect(prisma.projects.create).toHaveBeenCalledWith({
      data: { owner_id: 'u1', title: 'Idée', description: 'Description' },
    });
  });

  it("findOneForOwner lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
    prisma.projects.findFirst.mockResolvedValue(null);

    await expect(service.findOneForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOneForOwner renvoie le projet trouvé', async () => {
    const project = { id: 'p1', owner_id: 'u1', title: 'Idée' };
    prisma.projects.findFirst.mockResolvedValue(project);

    await expect(service.findOneForOwner('u1', 'p1')).resolves.toEqual(project);
  });

  describe('updateForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.updateForOwner('u1', 'p1', 'Nouveau titre')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.projects.update).not.toHaveBeenCalled();
    });

    it('met à jour le projet une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', title: 'Nouveau titre' });

      const result = await service.updateForOwner('u1', 'p1', 'Nouveau titre', undefined);

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { title: 'Nouveau titre', description: undefined },
      });
      expect(result).toEqual({ id: 'p1', title: 'Nouveau titre' });
    });
  });

  describe('deleteForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.deleteForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projects.delete).not.toHaveBeenCalled();
    });

    it('supprime le projet une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });

      await service.deleteForOwner('u1', 'p1');

      expect(prisma.projects.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('analyzeForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.analyzeForOwner('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(analysisService.analyzeProject).not.toHaveBeenCalled();
    });

    it('analyse le projet puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const analysis = {
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: ['Force'],
        risks: ['Risque'],
        next_steps: ['Étape'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue(analysis);
      prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1', ...analysis });

      const result = await service.analyzeForOwner('u1', 'p1');

      expect(analysisService.analyzeProject).toHaveBeenCalledWith('Idée', 'Desc');
      expect(prisma.analyses.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...analysis },
      });
      expect(result).toEqual({ id: 'a1', project_id: 'p1', ...analysis });
    });
  });

  describe('listAnalysesForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listAnalysesForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les analyses du projet, les plus récentes en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.analyses.findMany.mockResolvedValue([{ id: 'a1' }]);

      const result = await service.listAnalysesForOwner('u1', 'p1');

      expect(prisma.analyses.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'a1' }]);
    });
  });

  describe('createBuildPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createBuildPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(planningService.createBuildPlan).not.toHaveBeenCalled();
    });

    it('génère le plan puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1'],
        key_resources: ['Ressource 1'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      planningService.createBuildPlan.mockResolvedValue(plan);
      prisma.build_plans.create.mockResolvedValue({ id: 'bp1', project_id: 'p1', ...plan });

      const result = await service.createBuildPlanForOwner('u1', 'p1');

      expect(planningService.createBuildPlan).toHaveBeenCalledWith('Idée', 'Desc');
      expect(prisma.build_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'bp1', project_id: 'p1', ...plan });
    });
  });

  describe('listBuildPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listBuildPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.build_plans.findMany.mockResolvedValue([{ id: 'bp1' }]);

      const result = await service.listBuildPlansForOwner('u1', 'p1');

      expect(prisma.build_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'bp1' }]);
    });
  });
});
