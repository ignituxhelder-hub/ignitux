import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FinancingService } from './financing.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('FinancingService', () => {
  let service: FinancingService;
  let prisma: {
    projects: { findFirst: Mock };
    project_collaborators: { findFirst: Mock };
    financing_rounds: { create: Mock; findMany: Mock; findFirst: Mock; delete: Mock };
    equity_holders: { create: Mock; findMany: Mock; findFirst: Mock; delete: Mock };
    equity_events: { create: Mock; findMany: Mock };
    dividend_distributions: { create: Mock; findMany: Mock };
    constitution_violations: { createMany: Mock };
    buyback_objectives: { findMany: Mock; findUnique: Mock; upsert: Mock; update: Mock };
  };

  const OWNED = { id: 'p1', owner_id: 'u1' };

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue(OWNED) },
      project_collaborators: { findFirst: vi.fn().mockResolvedValue(null) },
      financing_rounds: {
        create: vi.fn().mockResolvedValue({ id: 'r1' }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      equity_holders: {
        create: vi.fn().mockResolvedValue({ id: 'h1' }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      equity_events: { create: vi.fn().mockResolvedValue({ id: 'e1' }), findMany: vi.fn().mockResolvedValue([]) },
      constitution_violations: { createMany: vi.fn() },
      buyback_objectives: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 'b1' }),
        update: vi.fn().mockResolvedValue({ id: 'b1' }),
      },
      dividend_distributions: {
        create: vi.fn().mockResolvedValue({ id: 'd1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancingService,
        ConstitutionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FinancingService>(FinancingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('financements', () => {
    it("enregistre un apport à sa date réelle, pas à celle de la saisie", async () => {
      const occurred = new Date('2026-03-01T00:00:00.000Z');

      await service.recordRound('u1', 'p1', 'ignitux', 500000, occurred, 'Premier apport');

      expect(prisma.financing_rounds.create.mock.calls[0][0].data).toMatchObject({
        project_id: 'p1',
        source: 'ignitux',
        amount_cents: 500000,
        occurred_at: occurred,
      });
    });

    it('refuse un montant nul ou négatif', async () => {
      await expect(
        service.recordRound('u1', 'p1', 'ignitux', 0, new Date()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse d'enregistrer sur le projet d'un autre", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.recordRound('u2', 'p1', 'ignitux', 1000, new Date()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.financing_rounds.create).not.toHaveBeenCalled();
    });

    it('totalise ce qui a été réellement reçu', async () => {
      prisma.financing_rounds.findMany.mockResolvedValue([
        { amount_cents: 500000 },
        { amount_cents: 250000 },
      ]);

      await expect(service.listRounds('u1', 'p1')).resolves.toMatchObject({ totalCents: 750000 });
    });
  });

  describe('parts', () => {
    beforeEach(() => {
      prisma.equity_holders.findFirst.mockResolvedValue({ id: 'h1', project_id: 'p1' });
    });

    it('enregistre la part saisie sans la recalculer', async () => {
      // Ignitux n'a aucune règle de dilution à appliquer.
      await service.recordEquityChange('u1', 'h1', 7000, 'Rachat par le porteur', new Date('2026-05-01'));

      expect(prisma.equity_events.create.mock.calls[0][0].data).toMatchObject({
        holder_id: 'h1',
        share_basis_points: 7000,
        reason: 'Rachat par le porteur',
      });
    });

    it('refuse une part supérieure à 100 %', async () => {
      await expect(
        service.recordEquityChange('u1', 'h1', 10001, 'Erreur', new Date()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse une part négative', async () => {
      await expect(
        service.recordEquityChange('u1', 'h1', -1, 'Erreur', new Date()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse de modifier les parts d'un projet qui n'est pas le sien", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.recordEquityChange('u2', 'h1', 5000, 'Tentative', new Date()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.equity_events.create).not.toHaveBeenCalled();
    });
  });

  describe('getCapTable', () => {
    it('joint le rappel du modèle économique à la répartition', async () => {
      const table = await service.getCapTable('u1', 'p1');

      expect(table.notice).toContain('51 %');
      expect(table.notice).toContain('ni valorisation du projet');
    });

    it('construit la répartition à partir des événements', async () => {
      prisma.equity_holders.findMany.mockResolvedValue([
        { id: 'h1', name: 'Porteur', is_founder: true },
        { id: 'h2', name: 'Ignitux', is_founder: false },
      ]);
      prisma.equity_events.findMany.mockResolvedValue([
        { holder_id: 'h1', share_basis_points: 7000, occurred_at: new Date('2026-01-01') },
        { holder_id: 'h2', share_basis_points: 3000, occurred_at: new Date('2026-01-01') },
      ]);

      const table = await service.getCapTable('u1', 'p1');

      expect(table.founderHasMajority).toBe(true);
      expect(table.discrepancyBasisPoints).toBe(0);
    });

    it('interroge en accès lecture, qui inclut les collaborateurs', async () => {
      // Un collaborateur a besoin de connaître la répartition ; il n'a
      // aucune légitimité à la modifier. La lecture passe donc par
      // assertHasProjectAccess (propriétaire OU collaborateur) et non par
      // assertOwnsProject.
      await service.getCapTable('u2', 'p1');

      expect(prisma.projects.findFirst.mock.calls[0][0].where.OR).toEqual([
        { owner_id: 'u2' },
        { collaborators: { some: { user_id: 'u2' } } },
      ]);
    });

    it("écrire, en revanche, reste réservé au propriétaire", async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.addHolder('u2', 'p1', 'Intrus', false),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.equity_holders.create).not.toHaveBeenCalled();
    });
  });

  describe('dividendes', () => {
    beforeEach(() => {
      prisma.equity_holders.findFirst.mockResolvedValue({ id: 'h1', project_id: 'p1' });
    });

    it('enregistre un versement réel', async () => {
      const occurred = new Date('2026-12-01');

      await service.recordDividend('u1', 'h1', 120000, occurred, 'Exercice 2026');

      expect(prisma.dividend_distributions.create.mock.calls[0][0].data).toMatchObject({
        holder_id: 'h1',
        amount_cents: 120000,
        occurred_at: occurred,
      });
    });

    it('refuse un montant nul', async () => {
      await expect(service.recordDividend('u1', 'h1', 0, new Date())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('totalise les dividendes réellement versés', async () => {
      prisma.dividend_distributions.findMany.mockResolvedValue([
        { amount_cents: 100000 },
        { amount_cents: 20000 },
      ]);

      await expect(service.listDividends('u1', 'p1')).resolves.toMatchObject({
        totalCents: 120000,
      });
    });
  });

  describe('rachat progressif', () => {
    it("joint l'avertissement de périmètre à la progression", async () => {
      const progress = await service.getBuybackProgress('u1', 'p1');

      expect(progress.notice).toContain('ni le prix de rachat');
      expect(progress.conditions).toHaveLength(3);
    });

    it('remet la condition à non atteinte quand on réécrit sa définition', async () => {
      // Une condition déclarée atteinte puis redéfinie porterait une
      // déclaration qui ne correspond plus à ce qui a été déclaré : c'est
      // la réinterprétation après coup que ce dispositif doit empêcher.
      await service.setBuybackObjective('u1', 'p1', 'rentabilite', 'Nouvelle définition.');

      expect(prisma.buyback_objectives.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { definition: 'Nouvelle définition.', reached_at: null, evidence: null },
        }),
      );
    });

    it("refuse de déclarer atteinte une condition jamais définie", async () => {
      prisma.buyback_objectives.findUnique.mockResolvedValue(null);

      await expect(
        service.declareBuybackObjective('u1', 'p1', 'autonomie', '2026-06-01', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.buyback_objectives.update).not.toHaveBeenCalled();
    });

    it('enregistre la déclaration du porteur avec sa justification', async () => {
      prisma.buyback_objectives.findUnique.mockResolvedValue({ id: 'b1', kind: 'autonomie' });

      await service.declareBuybackObjective('u1', 'p1', 'autonomie', '2026-06-01', 'Bilan 2026.');

      expect(prisma.buyback_objectives.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { reached_at: new Date('2026-06-01'), evidence: 'Bilan 2026.' },
      });
    });

    it('efface la justification quand on revient sur la déclaration', async () => {
      // Sinon la trace dirait « atteint parce que… » à côté d'une
      // condition redevenue non atteinte.
      prisma.buyback_objectives.findUnique.mockResolvedValue({ id: 'b1', kind: 'autonomie' });

      await service.declareBuybackObjective('u1', 'p1', 'autonomie', null, 'Bilan 2026.');

      expect(prisma.buyback_objectives.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { reached_at: null, evidence: null },
      });
    });

    it("laisse un collaborateur lire, mais pas écrire", async () => {
      // Savoir à quelles conditions le porteur reprendra ses parts fait
      // partie de ce qu'un collaborateur a besoin de comprendre ; les
      // fixer ne le regarde pas.
      prisma.projects.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve('OR' in where ? OWNED : null),
      );

      await expect(service.getBuybackProgress('u2', 'p1')).resolves.toBeDefined();
      await expect(
        service.setBuybackObjective('u2', 'p1', 'stabilite', 'Tentative.'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
