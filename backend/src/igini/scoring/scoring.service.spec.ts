import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../../constitution/constitution.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScoringService } from './scoring.service.js';

describe('ScoringService', () => {
  let service: ScoringService;
  let constitution: ConstitutionService;
  let prisma: {
    projects: { findFirst: ReturnType<typeof vi.fn> };
    analyses: { findFirst: ReturnType<typeof vi.fn> };
    build_plans: { findFirst: ReturnType<typeof vi.fn> };
    financing_plans: { findFirst: ReturnType<typeof vi.fn> };
    development_plans: { findFirst: ReturnType<typeof vi.fn> };
    transmission_plans: { findFirst: ReturnType<typeof vi.fn> };
    tasks: { findMany: ReturnType<typeof vi.fn> };
    constitution_violations: { createMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn() },
      analyses: { findFirst: vi.fn() },
      build_plans: { findFirst: vi.fn() },
      financing_plans: { findFirst: vi.fn() },
      development_plans: { findFirst: vi.fn() },
      transmission_plans: { findFirst: vi.fn() },
      tasks: { findMany: vi.fn() },
      constitution_violations: { createMany: vi.fn() },
    };
    // Par défaut, rien n'existe encore pour ce projet.
    prisma.analyses.findFirst.mockResolvedValue(null);
    prisma.build_plans.findFirst.mockResolvedValue(null);
    prisma.financing_plans.findFirst.mockResolvedValue(null);
    prisma.development_plans.findFirst.mockResolvedValue(null);
    prisma.transmission_plans.findFirst.mockResolvedValue(null);
    prisma.tasks.findMany.mockResolvedValue([]);

    // Le vrai ConstitutionService, pas un mock : c'est lui qui garantit
    // qu'aucun score n'est publié sans source, et un mock permissif ferait
    // passer silencieusement la régression que ce moteur existe pour
    // attraper. Seule son écriture de journal est neutralisée.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        ConstitutionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
    constitution = module.get<ConstitutionService>(ConstitutionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it("lève une NotFoundException si le projet n'appartient pas à l'utilisateur", async () => {
    prisma.projects.findFirst.mockResolvedValue(null);

    await expect(service.getScoreCard('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("renvoie des scores null quand aucune étape n'a encore été faite", async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });

    const score = await service.getScoreCard('u1', 'p1');

    expect(score).toEqual({
      etincelle: null,
      construction: null,
      evolution: null,
      transmission: null,
      confiance: null,
    });
  });

  it('calcule étincelle depuis la dernière analyse', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
    prisma.analyses.findFirst.mockResolvedValue({ feasibility_score: 7 });

    const score = await service.getScoreCard('u1', 'p1');

    expect(score.etincelle).toBe(7);
  });

  it('calcule construction depuis la proportion de tâches terminées', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
    prisma.tasks.findMany.mockResolvedValue([
      { status: 'done' },
      { status: 'done' },
      { status: 'pending' },
      { status: 'pending' },
    ]);

    const score = await service.getScoreCard('u1', 'p1');

    expect(score.construction).toBe(5); // 2/4 = 50% = 5/10
  });

  it('plafonne évolution et transmission à 10', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
    prisma.development_plans.findFirst.mockResolvedValue({
      growth_levers: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    prisma.transmission_plans.findFirst.mockResolvedValue({
      transfer_options: ['a', 'b', 'c'],
      key_documentation: ['a', 'b', 'c'],
      readiness_checklist: ['a', 'b', 'c'],
    });

    const score = await service.getScoreCard('u1', 'p1');

    expect(score.evolution).toBe(10);
    expect(score.transmission).toBe(9);
  });

  it("calcule confiance comme la proportion d'étapes entamées", async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
    prisma.analyses.findFirst.mockResolvedValue({ feasibility_score: 5 });
    prisma.build_plans.findFirst.mockResolvedValue({});

    const score = await service.getScoreCard('u1', 'p1');

    expect(score.confiance).toBe(4); // 2/5 = 40% = 4/10
  });

  it('un collaborateur (pas seulement le propriétaire) peut consulter le score', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
    prisma.analyses.findFirst.mockResolvedValue({ feasibility_score: 7 });

    const score = await service.getScoreCard('u2-collaborateur', 'p1');

    expect(score.etincelle).toBe(7);
  });

  describe('contrôle constitutionnel', () => {
    it('soumet chaque champ de la fiche au moteur avant de la renvoyer', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      const guard = vi.spyOn(constitution, 'guard');

      const score = await service.getScoreCard('u1', 'p1');

      expect(guard).toHaveBeenCalledTimes(Object.keys(score).length);
      expect(guard).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'publish_score', field: 'confiance' }),
        { userId: 'u1', projectId: 'p1' },
      );
    });

    it('refuse de renvoyer une fiche contenant un score sans source', async () => {
      // On force le cas que le code ne doit plus produire : un score chiffré
      // alors qu'aucune donnée ne l'appuie. Sans le garde-fou, la fiche
      // sortirait telle quelle ; avec lui, l'appel échoue bruyamment.
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.tasks.findMany.mockResolvedValue([]);
      vi.spyOn(
        service as unknown as {
          assertScoresHaveSources: (...args: unknown[]) => Promise<void>;
        },
        'assertScoresHaveSources',
      ).mockImplementation(async () => {
        await constitution.guard(
          { kind: 'publish_score', field: 'construction', value: 0, hasSource: false },
          { userId: 'u1', projectId: 'p1' },
        );
      });

      await expect(service.getScoreCard('u1', 'p1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.constitution_violations.createMany).toHaveBeenCalled();
    });
  });
});
