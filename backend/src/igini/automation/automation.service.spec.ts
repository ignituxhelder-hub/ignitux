import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AutomationService } from './automation.service.js';

describe('AutomationService', () => {
  let service: AutomationService;
  let prisma: {
    analyses: { findFirst: ReturnType<typeof vi.fn> };
    build_plans: { findFirst: ReturnType<typeof vi.fn> };
    financing_plans: { findFirst: ReturnType<typeof vi.fn> };
    development_plans: { findFirst: ReturnType<typeof vi.fn> };
    transmission_plans: { findFirst: ReturnType<typeof vi.fn> };
    tasks: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    concepts: { findMany: ReturnType<typeof vi.fn> };
    concept_links: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    automation_runs: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      analyses: { findFirst: vi.fn() },
      build_plans: { findFirst: vi.fn() },
      financing_plans: { findFirst: vi.fn() },
      development_plans: { findFirst: vi.fn() },
      transmission_plans: { findFirst: vi.fn() },
      tasks: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      concepts: { findMany: vi.fn() },
      concept_links: { findMany: vi.fn(), create: vi.fn() },
      automation_runs: { create: vi.fn(), findMany: vi.fn() },
    };
    // Par défaut : aucune étape n'existe, aucune tâche ouverte, aucun concept.
    prisma.analyses.findFirst.mockResolvedValue(null);
    prisma.build_plans.findFirst.mockResolvedValue(null);
    prisma.financing_plans.findFirst.mockResolvedValue(null);
    prisma.development_plans.findFirst.mockResolvedValue(null);
    prisma.transmission_plans.findFirst.mockResolvedValue(null);
    prisma.tasks.findMany.mockResolvedValue([]);
    prisma.concepts.findMany.mockResolvedValue([]);
    prisma.concept_links.findMany.mockResolvedValue([]);
    prisma.automation_runs.create.mockResolvedValue({ id: 'run1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AutomationService>(AutomationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('run — tâches par étape', () => {
    it('crée une tâche igini/automation pour chaque étape manquante', async () => {
      prisma.tasks.create.mockImplementation((args) => Promise.resolve({ id: 't-new', ...args.data }));

      const result = await service.run('p1');

      expect(prisma.tasks.create).toHaveBeenCalledTimes(5);
      expect(prisma.tasks.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          project_id: 'p1',
          assignee: 'igini',
          source: 'automation',
        }),
      });
      expect(result.tasksCreated).toHaveLength(5);
    });

    it("ne recrée pas de tâche si une tâche d'automatisation ouverte existe déjà pour cette étape", async () => {
      prisma.tasks.findMany.mockResolvedValue([
        { id: 't1', title: "Lancer l'analyse de faisabilité (Étincelle)", status: 'pending' },
      ]);

      const result = await service.run('p1');

      expect(prisma.tasks.create).toHaveBeenCalledTimes(4);
      expect(result.tasksCreated).toHaveLength(4);
    });

    it('ferme automatiquement une tâche ouverte dès que son étape est satisfaite', async () => {
      prisma.analyses.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.tasks.findMany.mockResolvedValue([
        { id: 't1', title: "Lancer l'analyse de faisabilité (Étincelle)", status: 'pending' },
      ]);
      prisma.tasks.update.mockResolvedValue({ id: 't1', status: 'done' });

      const result = await service.run('p1');

      expect(prisma.tasks.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'done' } });
      expect(result.tasksClosed).toEqual([{ id: 't1', status: 'done' }]);
      // Les 4 autres étapes manquantes créent bien leurs tâches.
      expect(prisma.tasks.create).toHaveBeenCalledTimes(4);
    });

    it("ne crée ni ne ferme rien pour une étape déjà complète sans tâche ouverte", async () => {
      prisma.analyses.findFirst.mockResolvedValue({ id: 'a1' });

      const result = await service.run('p1');

      expect(result.tasksCreated).toHaveLength(4);
      expect(result.tasksClosed).toHaveLength(0);
    });
  });

  describe('run — auto-liaison de concepts', () => {
    it('relie deux concepts qui partagent un mot significatif', async () => {
      prisma.concepts.findMany.mockResolvedValue([
        { id: 'c1', name: 'Marché des food-trucks', description: null },
        { id: 'c2', name: 'Réglementation food-truck', description: null },
      ]);
      prisma.concept_links.create.mockResolvedValue({ id: 'l1' });

      const result = await service.run('p1');

      expect(prisma.concept_links.create).toHaveBeenCalledWith({
        data: { from_concept_id: 'c1', to_concept_id: 'c2', relation_type: 'lié automatiquement (mot commun)' },
      });
      expect(result.conceptLinksCreated).toEqual([{ id: 'l1' }]);
    });

    it('ne relie pas deux concepts déjà liés (dans un sens ou dans l\'autre)', async () => {
      prisma.concepts.findMany.mockResolvedValue([
        { id: 'c1', name: 'Marché des food-trucks', description: null },
        { id: 'c2', name: 'Réglementation food-truck', description: null },
      ]);
      prisma.concept_links.findMany.mockResolvedValue([{ from_concept_id: 'c2', to_concept_id: 'c1' }]);

      const result = await service.run('p1');

      expect(prisma.concept_links.create).not.toHaveBeenCalled();
      expect(result.conceptLinksCreated).toEqual([]);
    });

    it('ne relie pas deux concepts sans mot significatif commun', async () => {
      prisma.concepts.findMany.mockResolvedValue([
        { id: 'c1', name: 'Client cible', description: null },
        { id: 'c2', name: 'Offre SaaS', description: null },
      ]);

      const result = await service.run('p1');

      expect(prisma.concept_links.create).not.toHaveBeenCalled();
      expect(result.conceptLinksCreated).toEqual([]);
    });

    it("n'essaie pas de relier des concepts au-delà du seuil de sécurité", async () => {
      const manyConcepts = Array.from({ length: 51 }, (_, i) => ({
        id: `c${i}`,
        name: `Concept ${i}`,
        description: null,
      }));
      prisma.concepts.findMany.mockResolvedValue(manyConcepts);

      const result = await service.run('p1');

      expect(prisma.concept_links.findMany).not.toHaveBeenCalled();
      expect(result.conceptLinksCreated).toEqual([]);
    });
  });

  describe('run — journalisation', () => {
    it('enregistre un automation_run avec les compteurs de cette exécution', async () => {
      prisma.analyses.findFirst.mockResolvedValue({ id: 'a1' });

      await service.run('p1');

      expect(prisma.automation_runs.create).toHaveBeenCalledWith({
        data: {
          project_id: 'p1',
          tasks_created_count: 4,
          tasks_closed_count: 0,
          concept_links_created_count: 0,
        },
      });
    });
  });

  describe('listRuns', () => {
    it("renvoie l'historique des exécutions pour un projet, plus récent d'abord", async () => {
      prisma.automation_runs.findMany.mockResolvedValue([{ id: 'run1' }]);

      const result = await service.listRuns('p1');

      expect(prisma.automation_runs.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'run1' }]);
    });
  });
});
