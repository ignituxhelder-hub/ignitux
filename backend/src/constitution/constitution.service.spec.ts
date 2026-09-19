import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CONSTITUTION_ARTICLES, CONSTITUTION_VERSION } from './constitution-articles.js';
import { ConstitutionService } from './constitution.service.js';

describe('ConstitutionService', () => {
  let service: ConstitutionService;
  let prisma: {
    constitution_articles: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    constitution_violations: {
      createMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    automation_runs: { count: ReturnType<typeof vi.fn> };
    analyses: { count: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
    build_plans: { count: ReturnType<typeof vi.fn> };
    financing_plans: { count: ReturnType<typeof vi.fn> };
    development_plans: { count: ReturnType<typeof vi.fn> };
    transmission_plans: { count: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      constitution_articles: { upsert: vi.fn(), findMany: vi.fn() },
      constitution_violations: { createMany: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
      automation_runs: { count: vi.fn() },
      analyses: { count: vi.fn(), groupBy: vi.fn() },
      build_plans: { count: vi.fn() },
      financing_plans: { count: vi.fn() },
      development_plans: { count: vi.fn() },
      transmission_plans: { count: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConstitutionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ConstitutionService>(ConstitutionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('semis du corpus', () => {
    it('upsert chaque article sous la version du corpus (idempotent)', async () => {
      prisma.constitution_articles.upsert.mockResolvedValue({});

      await service.onModuleInit();

      expect(prisma.constitution_articles.upsert).toHaveBeenCalledTimes(
        CONSTITUTION_ARTICLES.length,
      );
      const firstCall = prisma.constitution_articles.upsert.mock.calls[0][0];
      expect(firstCall.where).toEqual({ slug: CONSTITUTION_ARTICLES[0].slug });
      expect(firstCall.create.version).toBe(CONSTITUTION_VERSION);
    });

    it("n'annonce pas être la V1 officielle, qui n'a jamais été fournie", () => {
      // Test de garde volontaire : si quelqu'un renomme la version en 'v1'
      // sans disposer du texte officiel, ce test échoue. Le corpus actuel
      // est une transcription des principes fournis, rien d'autre.
      expect(CONSTITUTION_VERSION).not.toBe('v1');
      expect(CONSTITUTION_ARTICLES).toHaveLength(12);
    });
  });

  describe('guard', () => {
    it('laisse passer une action conforme sans rien journaliser', async () => {
      await service.guard({
        kind: 'publish_score',
        field: 'etincelle',
        value: 7,
        hasSource: true,
      });

      expect(prisma.constitution_violations.createMany).not.toHaveBeenCalled();
    });

    it('journalise puis bloque une violation bloquante', async () => {
      prisma.constitution_violations.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.guard(
          { kind: 'publish_score', field: 'confiance', value: 0, hasSource: false },
          { userId: 'user-1', projectId: 'project-1' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(prisma.constitution_violations.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            article_slug: 'pas-de-score-invente',
            rule_id: 'score-sans-source',
            severity: 'blocking',
            action: 'publish_score',
            user_id: 'user-1',
            project_id: 'project-1',
          }),
        ],
      });
    });

    it('journalise sans bloquer une violation de niveau avertissement', async () => {
      prisma.constitution_violations.createMany.mockResolvedValue({ count: 1 });

      await service.guard({
        kind: 'persist_generated',
        entity: 'analyses',
        generatedBy: 'igini',
        generatedModel: null,
      });

      expect(prisma.constitution_violations.createMany).toHaveBeenCalled();
    });

    it("n'échoue pas si le journal est indisponible, mais applique quand même le verdict", async () => {
      // Une panne du journal ne doit ni faire échouer une action conforme,
      // ni laisser passer une action interdite.
      prisma.constitution_violations.createMany.mockRejectedValue(new Error('base indisponible'));

      await expect(
        service.guard({ kind: 'autonomous_act', engine: 'automation', journalled: false }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('audit', () => {
    beforeEach(() => {
      prisma.constitution_articles.findMany.mockResolvedValue(
        CONSTITUTION_ARTICLES.map((article) => ({ ...article, version: CONSTITUTION_VERSION })),
      );
      prisma.constitution_violations.groupBy.mockResolvedValue([]);
      prisma.automation_runs.count.mockResolvedValue(0);
      prisma.analyses.groupBy.mockResolvedValue([]);
      for (const table of [
        'analyses',
        'build_plans',
        'financing_plans',
        'development_plans',
        'transmission_plans',
      ] as const) {
        prisma[table].count.mockResolvedValue(0);
      }
    });

    it('renvoie une entrée par article, sans pourcentage global inventé', async () => {
      const audit = await service.audit();

      expect(audit).toHaveLength(CONSTITUTION_ARTICLES.length);
      expect(audit.every((entry) => 'measured' in entry)).toBe(true);
    });

    it('laisse measured à null pour les articles qu\'aucune donnée n\'éclaire', async () => {
      const audit = await service.audit();

      const mission = audit.find((entry) => entry.slug === 'mission-nous-servir');
      expect(mission?.measured).toBeNull();
    });

    it('mesure la provenance à partir des comptages réels', async () => {
      prisma.analyses.count.mockImplementation((args?: { where?: unknown }) =>
        Promise.resolve(args?.where ? 2 : 10),
      );

      const audit = await service.audit();
      const article = audit.find(
        (entry) => entry.slug === 'pas-de-simulation-presentee-comme-reelle',
      );

      // 10 analyses au total dont 2 sans modèle connu, les 4 autres tables vides.
      expect(article?.measured).toContain('8/10');
    });

    it("compte les analyses successives comme preuve que l'Étincelle n'est pas écrasée", async () => {
      prisma.analyses.groupBy.mockResolvedValue([
        { project_id: 'p1', _count: { _all: 3 } },
        { project_id: 'p2', _count: { _all: 1 } },
      ]);

      const audit = await service.audit();
      const article = audit.find((entry) => entry.slug === 'protection-de-l-etincelle');

      expect(article?.measured).toContain('1/2');
    });

    it('remonte le nombre de violations récentes par article', async () => {
      prisma.constitution_violations.groupBy.mockResolvedValue([
        { article_slug: 'pas-de-score-invente', _count: { _all: 4 } },
      ]);

      const audit = await service.audit();

      expect(
        audit.find((entry) => entry.slug === 'pas-de-score-invente')?.violationsLast30Days,
      ).toBe(4);
      expect(
        audit.find((entry) => entry.slug === 'mission-nous-servir')?.violationsLast30Days,
      ).toBe(0);
    });
  });

  it('listRules expose les règles réellement exécutables', () => {
    const rules = service.listRules();

    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveProperty('description');
  });
});
