import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScoringService } from './scoring.service.js';

describe('ScoringService', () => {
  let service: ScoringService;
  let prisma: {
    projects: { findFirst: ReturnType<typeof vi.fn> };
    analyses: { findFirst: ReturnType<typeof vi.fn> };
    build_plans: { findFirst: ReturnType<typeof vi.fn> };
    financing_plans: { findFirst: ReturnType<typeof vi.fn> };
    development_plans: { findFirst: ReturnType<typeof vi.fn> };
    transmission_plans: { findFirst: ReturnType<typeof vi.fn> };
    tasks: { findMany: ReturnType<typeof vi.fn> };
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
    };
    // Par défaut, rien n'existe encore pour ce projet.
    prisma.analyses.findFirst.mockResolvedValue(null);
    prisma.build_plans.findFirst.mockResolvedValue(null);
    prisma.financing_plans.findFirst.mockResolvedValue(null);
    prisma.development_plans.findFirst.mockResolvedValue(null);
    prisma.transmission_plans.findFirst.mockResolvedValue(null);
    prisma.tasks.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
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
      confiance: 0,
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
});
