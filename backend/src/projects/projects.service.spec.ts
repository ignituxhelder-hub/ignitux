import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../analysis/analysis.service.js';
import { DevelopmentService } from '../development/development.service.js';
import { FinancingService } from '../financing/financing.service.js';
import { PlanningService } from '../planning/planning.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransmissionService } from '../transmission/transmission.service.js';
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
    financing_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    development_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    transmission_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let analysisService: { analyzeProject: ReturnType<typeof vi.fn> };
  let planningService: { createBuildPlan: ReturnType<typeof vi.fn> };
  let financingService: { createFinancingPlan: ReturnType<typeof vi.fn> };
  let developmentService: { createDevelopmentPlan: ReturnType<typeof vi.fn> };
  let transmissionService: { createTransmissionPlan: ReturnType<typeof vi.fn> };

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
      financing_plans: { create: vi.fn(), findMany: vi.fn() },
      development_plans: { create: vi.fn(), findMany: vi.fn() },
      transmission_plans: { create: vi.fn(), findMany: vi.fn() },
    };
    analysisService = { analyzeProject: vi.fn() };
    planningService = { createBuildPlan: vi.fn() };
    financingService = { createFinancingPlan: vi.fn() };
    developmentService = { createDevelopmentPlan: vi.fn() };
    transmissionService = { createTransmissionPlan: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalysisService, useValue: analysisService },
        { provide: PlanningService, useValue: planningService },
        { provide: FinancingService, useValue: financingService },
        { provide: DevelopmentService, useValue: developmentService },
        { provide: TransmissionService, useValue: transmissionService },
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

  describe('createFinancingPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createFinancingPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(financingService.createFinancingPlan).not.toHaveBeenCalled();
    });

    it('génère le plan de financement puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        estimated_budget: '5 000 € à 15 000 €',
        funding_sources: ['Autofinancement'],
        budget_breakdown: ['Développement'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      financingService.createFinancingPlan.mockResolvedValue(plan);
      prisma.financing_plans.create.mockResolvedValue({ id: 'fp1', project_id: 'p1', ...plan });

      const result = await service.createFinancingPlanForOwner('u1', 'p1');

      expect(financingService.createFinancingPlan).toHaveBeenCalledWith('Idée', 'Desc');
      expect(prisma.financing_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'fp1', project_id: 'p1', ...plan });
    });
  });

  describe('listFinancingPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listFinancingPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.financing_plans.findMany.mockResolvedValue([{ id: 'fp1' }]);

      const result = await service.listFinancingPlansForOwner('u1', 'p1');

      expect(prisma.financing_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'fp1' }]);
    });
  });

  describe('createDevelopmentPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createDevelopmentPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(developmentService.createDevelopmentPlan).not.toHaveBeenCalled();
    });

    it('génère le plan de développement puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        growth_levers: ['Bouche-à-oreille'],
        key_metrics: ['Rétention'],
        scaling_risks: ['Support non préparé'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      developmentService.createDevelopmentPlan.mockResolvedValue(plan);
      prisma.development_plans.create.mockResolvedValue({ id: 'dp1', project_id: 'p1', ...plan });

      const result = await service.createDevelopmentPlanForOwner('u1', 'p1');

      expect(developmentService.createDevelopmentPlan).toHaveBeenCalledWith('Idée', 'Desc');
      expect(prisma.development_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'dp1', project_id: 'p1', ...plan });
    });
  });

  describe('listDevelopmentPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listDevelopmentPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.development_plans.findMany.mockResolvedValue([{ id: 'dp1' }]);

      const result = await service.listDevelopmentPlansForOwner('u1', 'p1');

      expect(prisma.development_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'dp1' }]);
    });
  });

  describe('createTransmissionPlanForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.createTransmissionPlanForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(transmissionService.createTransmissionPlan).not.toHaveBeenCalled();
    });

    it('génère le plan de transmission puis persiste le résultat', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const plan = {
        summary: 'Résumé',
        transfer_options: ['Association avec un repreneur'],
        key_documentation: ['Contrats fournisseurs'],
        readiness_checklist: ['Formaliser les processus clés'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      transmissionService.createTransmissionPlan.mockResolvedValue(plan);
      prisma.transmission_plans.create.mockResolvedValue({ id: 'tp1', project_id: 'p1', ...plan });

      const result = await service.createTransmissionPlanForOwner('u1', 'p1');

      expect(transmissionService.createTransmissionPlan).toHaveBeenCalledWith('Idée', 'Desc');
      expect(prisma.transmission_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'tp1', project_id: 'p1', ...plan });
    });
  });

  describe('listTransmissionPlansForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listTransmissionPlansForOwner('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liste les plans du projet, les plus récents en premier', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.transmission_plans.findMany.mockResolvedValue([{ id: 'tp1' }]);

      const result = await service.listTransmissionPlansForOwner('u1', 'p1');

      expect(prisma.transmission_plans.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'tp1' }]);
    });
  });
});
