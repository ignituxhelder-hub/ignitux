import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../igini/analysis/analysis.service.js';
import { DevelopmentService } from '../igini/development/development.service.js';
import { FinancingService } from '../igini/financing/financing.service.js';
import { PlanningService } from '../igini/planning/planning.service.js';
import { TransmissionService } from '../igini/transmission/transmission.service.js';
import { WorkflowService } from '../igini/workflow/workflow.service.js';
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
      findFirst: ReturnType<typeof vi.fn>;
    };
    build_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    financing_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    development_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    transmission_plans: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    project_collaborators: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    users: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let analysisService: { analyzeProject: ReturnType<typeof vi.fn> };
  let planningService: { createBuildPlan: ReturnType<typeof vi.fn> };
  let financingService: { createFinancingPlan: ReturnType<typeof vi.fn> };
  let developmentService: { createDevelopmentPlan: ReturnType<typeof vi.fn> };
  let transmissionService: { createTransmissionPlan: ReturnType<typeof vi.fn> };
  let workflowService: { createTasksFromSuggestions: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      projects: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      analyses: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      build_plans: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      financing_plans: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      development_plans: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      transmission_plans: { create: vi.fn(), findMany: vi.fn() },
      project_collaborators: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      users: { findUnique: vi.fn() },
    };
    // Par défaut, aucune étape précédente n'existe encore (buildProjectContext
    // doit alors renvoyer undefined) ; les tests qui veulent simuler un
    // contexte existant surchargent ces mocks explicitement.
    prisma.analyses.findFirst.mockResolvedValue(null);
    prisma.build_plans.findFirst.mockResolvedValue(null);
    prisma.financing_plans.findFirst.mockResolvedValue(null);
    prisma.development_plans.findFirst.mockResolvedValue(null);
    analysisService = { analyzeProject: vi.fn() };
    planningService = { createBuildPlan: vi.fn() };
    financingService = { createFinancingPlan: vi.fn() };
    developmentService = { createDevelopmentPlan: vi.fn() };
    transmissionService = { createTransmissionPlan: vi.fn() };
    workflowService = { createTasksFromSuggestions: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalysisService, useValue: analysisService },
        { provide: PlanningService, useValue: planningService },
        { provide: FinancingService, useValue: financingService },
        { provide: DevelopmentService, useValue: developmentService },
        { provide: TransmissionService, useValue: transmissionService },
        { provide: WorkflowService, useValue: workflowService },
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

  describe('setVisibilityForOwner', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.setVisibilityForOwner('u1', 'p1', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.projects.update).not.toHaveBeenCalled();
    });

    it('met à jour is_public une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.projects.update.mockResolvedValue({ id: 'p1', is_public: true });

      const result = await service.setVisibilityForOwner('u1', 'p1', true);

      expect(prisma.projects.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { is_public: true },
      });
      expect(result).toEqual({ id: 'p1', is_public: true });
    });
  });

  describe('findOneForViewer', () => {
    it("lève une NotFoundException si l'utilisateur n'est ni propriétaire ni collaborateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.findOneForViewer('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renvoie le projet pour le propriétaire', async () => {
      const project = { id: 'p1', owner_id: 'u1' };
      prisma.projects.findFirst.mockResolvedValue(project);

      await expect(service.findOneForViewer('u1', 'p1')).resolves.toEqual(project);
    });

    it('renvoie le projet pour un collaborateur', async () => {
      const project = { id: 'p1', owner_id: 'u1' };
      prisma.projects.findFirst.mockResolvedValue(project);

      await expect(service.findOneForViewer('u2', 'p1')).resolves.toEqual(project);
      expect(prisma.projects.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'p1',
          OR: [{ owner_id: 'u2' }, { collaborators: { some: { user_id: 'u2' } } }],
        },
      });
    });
  });

  describe('listCollaborators', () => {
    it("lève une NotFoundException si l'utilisateur n'a pas accès au projet", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.listCollaborators('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('liste les collaborateurs une fois l\'accès vérifié', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.project_collaborators.findMany.mockResolvedValue([{ id: 'pc1' }]);

      const result = await service.listCollaborators('u1', 'p1');

      expect(prisma.project_collaborators.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { created_at: 'asc' },
      });
      expect(result).toEqual([{ id: 'pc1' }]);
    });
  });

  describe('addCollaborator', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.addCollaborator('u1', 'p1', 'b@b.com')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.project_collaborators.create).not.toHaveBeenCalled();
    });

    it("lève une NotFoundException si aucun compte ne correspond à l'email", async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.users.findUnique.mockResolvedValue(null);

      await expect(service.addCollaborator('u1', 'p1', 'inconnu@example.com')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse d\'ajouter le propriétaire comme collaborateur', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'a@a.com' });

      await expect(service.addCollaborator('u1', 'p1', 'a@a.com')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.project_collaborators.create).not.toHaveBeenCalled();
    });

    it('refuse un doublon si la personne collabore déjà', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.users.findUnique.mockResolvedValue({ id: 'u2', email: 'b@b.com' });
      prisma.project_collaborators.findFirst.mockResolvedValue({ id: 'pc1' });

      await expect(service.addCollaborator('u1', 'p1', 'b@b.com')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.project_collaborators.create).not.toHaveBeenCalled();
    });

    it('ajoute le collaborateur une fois toutes les vérifications passées', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.users.findUnique.mockResolvedValue({ id: 'u2', email: 'b@b.com' });
      prisma.project_collaborators.findFirst.mockResolvedValue(null);
      prisma.project_collaborators.create.mockResolvedValue({ id: 'pc1' });

      const result = await service.addCollaborator('u1', 'p1', 'b@b.com');

      expect(prisma.project_collaborators.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', user_id: 'u2' },
        include: { user: { select: { id: true, email: true } } },
      });
      expect(result).toEqual({ id: 'pc1' });
    });
  });

  describe('removeCollaborator', () => {
    it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.removeCollaborator('u1', 'p1', 'u2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.project_collaborators.deleteMany).not.toHaveBeenCalled();
    });

    it('supprime le collaborateur une fois la propriété vérifiée', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });

      await service.removeCollaborator('u1', 'p1', 'u2');

      expect(prisma.project_collaborators.deleteMany).toHaveBeenCalledWith({
        where: { project_id: 'p1', user_id: 'u2' },
      });
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

    it('crée des tâches suivables à partir des prochaines étapes suggérées', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      const analysis = {
        summary: 'Résumé',
        feasibility_score: 8,
        strengths: ['Force'],
        risks: ['Risque'],
        next_steps: ['Étape 1', 'Étape 2'],
      };
      prisma.projects.findFirst.mockResolvedValue(project);
      analysisService.analyzeProject.mockResolvedValue(analysis);
      prisma.analyses.create.mockResolvedValue({ id: 'a1', project_id: 'p1', ...analysis });

      await service.analyzeForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Étape 1', 'Étape 2'],
        'analysis',
      );
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

    it('un collaborateur (pas seulement le propriétaire) peut lister les analyses', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.analyses.findMany.mockResolvedValue([{ id: 'a1' }]);

      await expect(service.listAnalysesForOwner('u2-collaborateur', 'p1')).resolves.toEqual([
        { id: 'a1' },
      ]);
      expect(prisma.projects.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'p1',
          OR: [{ owner_id: 'u2-collaborateur' }, { collaborators: { some: { user_id: 'u2-collaborateur' } } }],
        },
      });
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

      expect(planningService.createBuildPlan).toHaveBeenCalledWith('Idée', 'Desc', undefined);
      expect(prisma.build_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'bp1', project_id: 'p1', ...plan });
    });

    it("transmet le contexte de l'analyse existante à la génération du plan", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({
        summary: 'Idée prometteuse.',
        feasibility_score: 7,
      });
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1'],
        key_resources: ['Ressource 1'],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      expect(planningService.createBuildPlan).toHaveBeenCalledWith(
        'Idée',
        'Desc',
        expect.stringContaining('Idée prometteuse.'),
      );
    });

    it("ne transmet jamais le contenu d'étapes ultérieures (financement, développement), même si elles existent déjà", async () => {
      // Régression : ce test échouerait avec l'ancienne implémentation, qui
      // remontait sans distinction toutes les tables existantes.
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.financing_plans.findFirst.mockResolvedValue({ summary: 'Plan de financement futur.' });
      prisma.development_plans.findFirst.mockResolvedValue({ summary: 'Plan de croissance futur.' });
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1'],
        key_resources: ['Ressource 1'],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      const [, , context] = planningService.createBuildPlan.mock.calls[0];
      expect(context).toBeUndefined();
    });

    it('crée des tâches suivables à partir des jalons du plan', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      planningService.createBuildPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_timeline: '3 à 6 mois',
        milestones: ['Jalon 1', 'Jalon 2'],
        key_resources: ['Ressource 1'],
      });
      prisma.build_plans.create.mockResolvedValue({});

      await service.createBuildPlanForOwner('u1', 'p1');

      expect(workflowService.createTasksFromSuggestions).toHaveBeenCalledWith(
        'p1',
        ['Jalon 1', 'Jalon 2'],
        'build_plan',
      );
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

      expect(financingService.createFinancingPlan).toHaveBeenCalledWith('Idée', 'Desc', undefined);
      expect(prisma.financing_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'fp1', project_id: 'p1', ...plan });
    });

    it("compose le contexte à partir de l'analyse et de la construction, jamais du développement", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({ summary: 'Analyse.', feasibility_score: 6 });
      prisma.build_plans.findFirst.mockResolvedValue({ summary: 'Construction.' });
      prisma.development_plans.findFirst.mockResolvedValue({ summary: 'Ne doit pas apparaître.' });
      financingService.createFinancingPlan.mockResolvedValue({
        summary: 'Résumé',
        estimated_budget: '5 000 € à 15 000 €',
        funding_sources: ['Autofinancement'],
        budget_breakdown: ['Développement'],
      });
      prisma.financing_plans.create.mockResolvedValue({});

      await service.createFinancingPlanForOwner('u1', 'p1');

      const [, , context] = financingService.createFinancingPlan.mock.calls[0];
      expect(context).toContain('Analyse.');
      expect(context).toContain('Construction.');
      expect(context).not.toContain('Ne doit pas apparaître.');
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

      expect(developmentService.createDevelopmentPlan).toHaveBeenCalledWith('Idée', 'Desc', undefined);
      expect(prisma.development_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'dp1', project_id: 'p1', ...plan });
    });

    it("compose le contexte à partir de l'analyse, de la construction et du financement", async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({ summary: 'Analyse.', feasibility_score: 6 });
      prisma.build_plans.findFirst.mockResolvedValue({ summary: 'Construction.' });
      prisma.financing_plans.findFirst.mockResolvedValue({ summary: 'Financement.' });
      developmentService.createDevelopmentPlan.mockResolvedValue({
        summary: 'Résumé',
        growth_levers: ['Bouche-à-oreille'],
        key_metrics: ['Rétention'],
        scaling_risks: ['Support non préparé'],
      });
      prisma.development_plans.create.mockResolvedValue({});

      await service.createDevelopmentPlanForOwner('u1', 'p1');

      const [, , context] = developmentService.createDevelopmentPlan.mock.calls[0];
      expect(context).toContain('Analyse.');
      expect(context).toContain('Construction.');
      expect(context).toContain('Financement.');
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

      expect(transmissionService.createTransmissionPlan).toHaveBeenCalledWith('Idée', 'Desc', undefined);
      expect(prisma.transmission_plans.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', ...plan },
      });
      expect(result).toEqual({ id: 'tp1', project_id: 'p1', ...plan });
    });

    it('compose le contexte à partir des quatre étapes précédentes', async () => {
      const project = { id: 'p1', owner_id: 'u1', title: 'Idée', description: 'Desc' };
      prisma.projects.findFirst.mockResolvedValue(project);
      prisma.analyses.findFirst.mockResolvedValue({ summary: 'Analyse.', feasibility_score: 6 });
      prisma.build_plans.findFirst.mockResolvedValue({ summary: 'Construction.' });
      prisma.financing_plans.findFirst.mockResolvedValue({ summary: 'Financement.' });
      prisma.development_plans.findFirst.mockResolvedValue({ summary: 'Développement.' });
      transmissionService.createTransmissionPlan.mockResolvedValue({
        summary: 'Résumé',
        transfer_options: ['Association avec un repreneur'],
        key_documentation: ['Contrats fournisseurs'],
        readiness_checklist: ['Formaliser les processus clés'],
      });
      prisma.transmission_plans.create.mockResolvedValue({});

      await service.createTransmissionPlanForOwner('u1', 'p1');

      const [, , context] = transmissionService.createTransmissionPlan.mock.calls[0];
      expect(context).toContain('Analyse.');
      expect(context).toContain('Construction.');
      expect(context).toContain('Financement.');
      expect(context).toContain('Développement.');
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
