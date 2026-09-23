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
    score_snapshots: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
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
      // Le relevé du jour est posé à chaque lecture des scores.
      score_snapshots: { upsert: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
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

  describe('ScoringService — l’évolution dans le temps', () => {
    // Les scores restent calculés à la lecture. Cette table ne stocke pas LE
    // score, mais ce qu'il VALAIT un jour donné : deux choses différentes.
    it('relève les scores du jour à chaque lecture', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.analyses.findFirst.mockResolvedValue({ feasibility_score: 8 });
      prisma.tasks.findMany.mockResolvedValue([{ status: 'done' }]);

      await service.getScoreCard('u1', 'p1');

      expect(prisma.score_snapshots.upsert).toHaveBeenCalled();
      const appel = prisma.score_snapshots.upsert.mock.calls[0][0];
      expect(appel.create.etincelle).toBe(8);
    });

    // Un relevé entièrement vide occuperait la courbe d'un point sans
    // information.
    it('ne relève rien quand aucun axe n’a de source', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });

      await service.getScoreCard('u1', 'p1');

      expect(prisma.score_snapshots.upsert).not.toHaveBeenCalled();
    });

    // Perdre la lecture pour sauver l'historique est le mauvais arbitrage.
    it('rend les scores même si le relevé échoue', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.analyses.findFirst.mockResolvedValue({ feasibility_score: 8 });
      prisma.score_snapshots.upsert.mockRejectedValue(new Error('base injoignable'));

      await expect(service.getScoreCard('u1', 'p1')).resolves.toMatchObject({ etincelle: 8 });
    });

    it('rend l’historique du plus ancien au plus récent', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.score_snapshots.findMany.mockResolvedValue([
        {
          captured_on: new Date('2026-09-01T00:00:00Z'),
          etincelle: 6,
          construction: null,
          evolution: null,
          transmission: null,
          confiance: 2,
        },
      ]);

      const historique = await service.historique('u1', 'p1');

      expect(historique).toEqual([
        {
          jour: '2026-09-01',
          etincelle: 6,
          construction: null,
          evolution: null,
          transmission: null,
          confiance: 2,
        },
      ]);
      expect(prisma.score_snapshots.findMany.mock.calls[0][0].orderBy).toEqual({
        captured_on: 'asc',
      });
    });

    // Un projet qu'on n'a pas ouvert pendant trois semaines n'a pas
    // « progressé régulièrement » : il n'a pas été mesuré. Une courbe lissée
    // raconterait une histoire que personne n'a vécue.
    it('ne rend que des points observés, sans en inventer entre deux', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.score_snapshots.findMany.mockResolvedValue([
        { captured_on: new Date('2026-09-01T00:00:00Z'), etincelle: 6, construction: null, evolution: null, transmission: null, confiance: null },
        { captured_on: new Date('2026-09-20T00:00:00Z'), etincelle: 8, construction: null, evolution: null, transmission: null, confiance: null },
      ]);

      const historique = await service.historique('u1', 'p1');

      expect(historique).toHaveLength(2);
      expect(historique.map((p) => p.jour)).toEqual(['2026-09-01', '2026-09-20']);
    });

    it('rend une liste vide pour un projet jamais mesuré, ce qui n’est pas une erreur', async () => {
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.score_snapshots.findMany.mockResolvedValue([]);

      await expect(service.historique('u1', 'p1')).resolves.toEqual([]);
    });
  });
});
