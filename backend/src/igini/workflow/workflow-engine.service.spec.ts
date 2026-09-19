import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../../constitution/constitution.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WorkflowEngineService } from './workflow-engine.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('WorkflowEngineService', () => {
  let service: WorkflowEngineService;
  let constitutionService: { guard: Mock };
  let prisma: {
    projects: { findFirst: Mock };
    project_collaborators: { findFirst: Mock };
    workflow_definitions: { create: Mock; findFirst: Mock; findMany: Mock; delete: Mock };
    workflow_steps: { findMany: Mock };
    workflow_runs: { create: Mock; findFirst: Mock; findMany: Mock; update: Mock };
    workflow_events: { create: Mock; findMany: Mock; count: Mock };
    tasks: { findMany: Mock; findFirst: Mock; create: Mock };
    analyses: { count: Mock };
    build_plans: { count: Mock };
    financing_plans: { count: Mock };
    development_plans: { count: Mock };
    transmission_plans: { count: Mock };
  };

  const OWNED_PROJECT = { id: 'p1', owner_id: 'u1' };

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue(OWNED_PROJECT) },
      project_collaborators: { findFirst: vi.fn().mockResolvedValue(null) },
      workflow_definitions: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      workflow_steps: { findMany: vi.fn().mockResolvedValue([]) },
      workflow_runs: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })),
      },
      workflow_events: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(1),
      },
      tasks: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn() },
      analyses: { count: vi.fn().mockResolvedValue(0) },
      build_plans: { count: vi.fn().mockResolvedValue(0) },
      financing_plans: { count: vi.fn().mockResolvedValue(0) },
      development_plans: { count: vi.fn().mockResolvedValue(0) },
      transmission_plans: { count: vi.fn().mockResolvedValue(0) },
    };
    constitutionService = { guard: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConstitutionService, useValue: constitutionService },
      ],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('modèles', () => {
    it('expose les modèles disponibles avec leur nombre d\'étapes', () => {
      const templates = service.listTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].stepCount).toBeGreaterThan(0);
    });

    it('instancie un modèle en processus avec ses étapes ordonnées', async () => {
      prisma.workflow_definitions.create.mockResolvedValue({ id: 'w1' });

      await service.createFromTemplate('u1', 'p1', 'methode-ignitux');

      const created = prisma.workflow_definitions.create.mock.calls[0][0];
      expect(created.data.project_id).toBe('p1');
      expect(created.data.steps.create[0].position).toBe(0);
      expect(created.data.steps.create[0].condition_value).toBe('analysis');
    });

    it('refuse un modèle inconnu', async () => {
      await expect(service.createFromTemplate('u1', 'p1', 'inexistant')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("vérifie la propriété du projet avant d'instancier", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.createFromTemplate('u2', 'p1', 'methode-ignitux'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workflow_definitions.create).not.toHaveBeenCalled();
    });
  });

  describe('création manuelle', () => {
    const validStep = {
      title: 'Étape',
      conditionType: 'always',
      actionType: 'none',
    };

    it('refuse un processus sans étape', async () => {
      await expect(service.createWorkflow('u1', 'p1', 'Vide', undefined, [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuse une condition inconnue', async () => {
      await expect(
        service.createWorkflow('u1', 'p1', 'X', undefined, [
          { ...validStep, conditionType: 'quand-je-le-sens' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une condition qui exige une valeur sans en avoir", async () => {
      // Sinon l'étape serait créée déjà condamnée à ne jamais passer.
      await expect(
        service.createWorkflow('u1', 'p1', 'X', undefined, [
          { ...validStep, conditionType: 'stage_exists' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une action create_task sans intitulé", async () => {
      await expect(
        service.createWorkflow('u1', 'p1', 'X', undefined, [
          { ...validStep, actionType: 'create_task', actionValue: '   ' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepte un processus valide et numérote les étapes', async () => {
      prisma.workflow_definitions.create.mockResolvedValue({ id: 'w1' });

      await service.createWorkflow('u1', 'p1', 'Mon processus', 'Desc', [
        validStep,
        { ...validStep, title: 'Deuxième' },
      ]);

      const steps = prisma.workflow_definitions.create.mock.calls[0][0].data.steps.create;
      expect(steps.map((step: { position: number }) => step.position)).toEqual([0, 1]);
    });
  });

  describe('startRun', () => {
    beforeEach(() => {
      prisma.workflow_definitions.findFirst.mockResolvedValue({ id: 'w1', project_id: 'p1' });
    });

    it('refuse une seconde exécution concurrente du même processus', async () => {
      prisma.workflow_runs.findFirst.mockResolvedValue({ id: 'r0', status: 'running' });

      await expect(service.startRun('u1', 'w1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.workflow_runs.create).not.toHaveBeenCalled();
    });

    it('démarre puis avance immédiatement', async () => {
      prisma.workflow_runs.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'r1', project_id: 'p1', workflow_id: 'w1', current_position: 0 });
      prisma.workflow_runs.create.mockResolvedValue({ id: 'r1', project_id: 'p1' });

      const result = await service.startRun('u1', 'w1');

      expect(prisma.workflow_runs.create).toHaveBeenCalled();
      expect(result.run.id).toBeDefined();
    });
  });

  describe('advanceRun', () => {
    beforeEach(() => {
      prisma.workflow_runs.findFirst.mockResolvedValue({
        id: 'r1',
        project_id: 'p1',
        workflow_id: 'w1',
        current_position: 0,
      });
    });

    function steps(...list: Array<Record<string, unknown>>) {
      prisma.workflow_steps.findMany.mockResolvedValue(
        list.map((step, index) => ({
          position: index,
          title: `Étape ${index}`,
          condition_type: 'always',
          condition_value: null,
          action_type: 'none',
          action_value: null,
          ...step,
        })),
      );
    }

    it("franchit toutes les étapes satisfaites d'affilée", async () => {
      steps({}, {}, {});

      const result = await service.advanceRun('u1', 'r1');

      expect(result.stepsCompleted).toHaveLength(3);
      expect(result.run.status).toBe('completed');
      expect(result.blockedReason).toBeNull();
    });

    it("s'arrête à la première condition non satisfaite et dit pourquoi", async () => {
      steps({}, { condition_type: 'stage_exists', condition_value: 'build_plan' }, {});

      const result = await service.advanceRun('u1', 'r1');

      expect(result.stepsCompleted).toHaveLength(1);
      expect(result.run.status).toBe('blocked');
      expect(result.blockedReason).toContain('Plan de construction');
    });

    it('reprend à la position où la précédente exécution s\'était arrêtée', async () => {
      prisma.workflow_runs.findFirst.mockResolvedValue({
        id: 'r1',
        project_id: 'p1',
        workflow_id: 'w1',
        current_position: 2,
      });
      steps({}, {}, {}, {});

      const result = await service.advanceRun('u1', 'r1');

      expect(result.stepsCompleted.map((step) => step.position)).toEqual([2, 3]);
    });

    it('exécute l\'action create_task d\'une étape franchie', async () => {
      steps({ action_type: 'create_task', action_value: 'Relire le plan' });
      prisma.tasks.findFirst.mockResolvedValue(null);
      prisma.tasks.create.mockResolvedValue({ id: 't1', title: 'Relire le plan' });

      const result = await service.advanceRun('u1', 'r1');

      expect(prisma.tasks.create).toHaveBeenCalledWith({
        data: { project_id: 'p1', title: 'Relire le plan', assignee: 'human', source: 'workflow' },
      });
      expect(result.tasksCreated).toEqual([{ id: 't1', title: 'Relire le plan' }]);
    });

    it('ne recrée pas une tâche que la même étape a déjà créée', async () => {
      // Sans ce garde-fou, chaque génération sur le projet dupliquerait
      // les tâches de toutes les étapes déjà franchies.
      steps({ action_type: 'create_task', action_value: 'Relire le plan' });
      prisma.tasks.findFirst.mockResolvedValue({ id: 't1', title: 'Relire le plan' });

      const result = await service.advanceRun('u1', 'r1');

      expect(prisma.tasks.create).not.toHaveBeenCalled();
      expect(result.tasksCreated).toEqual([]);
    });

    it('journalise chaque étape franchie', async () => {
      steps({}, { condition_type: 'manual' });

      await service.advanceRun('u1', 'r1');

      const types = prisma.workflow_events.create.mock.calls.map(
        (call) => (call[0] as { data: { type: string } }).data.type,
      );
      expect(types).toContain('step_completed');
      expect(types).toContain('blocked');
    });

    it("ne journalise pas un blocage répété quand rien n'a avancé", async () => {
      // Sinon chaque consultation d'un processus en attente empilerait une
      // ligne identique et rendrait le journal illisible.
      steps({ condition_type: 'manual' });

      await service.advanceRun('u1', 'r1');

      const types = prisma.workflow_events.create.mock.calls.map(
        (call) => (call[0] as { data: { type: string } }).data.type,
      );
      expect(types).not.toContain('blocked');
    });

    it('soumet son avancée au moteur constitutionnel (article 5)', async () => {
      steps({});

      await service.advanceRun('u1', 'r1');

      expect(constitutionService.guard).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'autonomous_act', engine: 'workflow' }),
        { userId: 'u1', projectId: 'p1' },
      );
    });

    it("bloque plutôt que de franchir une condition qu'il ne sait pas lire", async () => {
      steps({ condition_type: 'type-inconnu-en-base' });

      const result = await service.advanceRun('u1', 'r1');

      expect(result.stepsCompleted).toHaveLength(0);
      expect(result.run.status).toBe('blocked');
    });

    it("vérifie la propriété du projet avant d'avancer", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(service.advanceRun('u2', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('confirmStep', () => {
    beforeEach(() => {
      prisma.workflow_runs.findFirst.mockResolvedValue({
        id: 'r1',
        project_id: 'p1',
        workflow_id: 'w1',
        current_position: 1,
      });
      prisma.workflow_steps.findMany.mockResolvedValue([]);
    });

    it("refuse de valider une étape qui n'est pas celle en attente", async () => {
      await expect(service.confirmStep('u1', 'r1', 3)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.workflow_events.create).not.toHaveBeenCalled();
    });

    it('journalise la validation puis relance l\'avancement', async () => {
      await service.confirmStep('u1', 'r1', 1);

      const first = prisma.workflow_events.create.mock.calls[0][0] as {
        data: { type: string; step_position: number };
      };
      expect(first.data.type).toBe('manual_confirmed');
      expect(first.data.step_position).toBe(1);
    });
  });

  describe('advanceActiveRunsForProject', () => {
    it("n'avance que les exécutions encore actives", async () => {
      prisma.workflow_runs.findMany.mockResolvedValue([]);

      await service.advanceActiveRunsForProject('u1', 'p1');

      expect(prisma.workflow_runs.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1', status: { in: ['running', 'blocked'] } },
      });
    });
  });
});
