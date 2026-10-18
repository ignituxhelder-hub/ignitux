import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fausseEquipe, refus, requetes } from '../equipe/visibilite.testing.js';
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
    participation_agreements: { findFirst: Mock };
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
      // Aucun accord par défaut : un projet sans accord se comporte comme avant.
      participation_agreements: { findFirst: vi.fn().mockResolvedValue(null) },
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

    describe("quand le projet a un accord de participation IGNITUX", () => {
      beforeEach(() => {
        prisma.participation_agreements.findFirst.mockResolvedValue({
          id: 'a1',
          project_id: 'p1',
          founder_holder_id: 'h1',
          ignitux_holder_id: 'h2',
        });
      });

      it("refuse la saisie manuelle de la part du porteur : elle passe par les paliers", async () => {
        await expect(
          service.recordEquityChange('u1', 'h1', 10000, 'Je me donne tout', new Date()),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.equity_events.create).not.toHaveBeenCalled();
      });

      it("refuse la saisie manuelle de la part d'IGNITUX", async () => {
        prisma.equity_holders.findFirst.mockResolvedValue({ id: 'h2', project_id: 'p1' });

        await expect(
          service.recordEquityChange('u1', 'h2', 0, 'Je sors IGNITUX', new Date()),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.equity_events.create).not.toHaveBeenCalled();
      });

      it("refuse de supprimer un détenteur de l'accord : l'historique partirait avec lui", async () => {
        await expect(service.removeHolder('u1', 'h1')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.equity_holders.delete).not.toHaveBeenCalled();
      });

      it("laisse saisir à la main un autre détenteur du même projet", async () => {
        prisma.equity_holders.findFirst.mockResolvedValue({ id: 'h3', project_id: 'p1' });

        await service.recordEquityChange('u1', 'h3', 0, 'Associé tiers', new Date());

        expect(prisma.equity_events.create).toHaveBeenCalled();
      });
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
      // Il connaît le projet (observateur) : un refus lisible, plus un « introuvable ».
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('ne dit pas à qui n’a pas accès si un tour ou un détenteur existe', () => {
    // Lu par son seul id puis jugé sur son projet, il répondait « Projet
    // introuvable. » à qui n'y avait pas accès, et « … introuvable. » à un
    // id inconnu : n'importe quel compte apprenait qu'il existe.
    const PROPRIO = 'proprio';
    const INCONNU = 'inconnu';
    const equipe = fausseEquipe(
      [{ id: 'p1', owner_id: PROPRIO }],
      [{ project_id: 'p1', user_id: 'associe', role: 'associe' }],
    );
    const TOUR = { id: 'r1', project_id: 'p1' };
    const DETENTEUR = { id: 'h1', project_id: 'p1', name: 'Alice', is_founder: false };

    beforeEach(() => {
      prisma.projects.findFirst.mockImplementation(equipe.lectureAccesProjet);
      prisma.financing_rounds.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; project?: unknown } }) =>
          where.id === TOUR.id && equipe.visible(TOUR.project_id, where.project) ? TOUR : null,
      );
      prisma.equity_holders.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; project?: unknown } }) =>
          where.id === DETENTEUR.id && equipe.visible(DETENTEUR.project_id, where.project) ? DETENTEUR : null,
      );
    });

    type Appel = (s: FinancingService, userId: string, id: string) => Promise<unknown>;
    const APPELS: [string, string, Appel, string][] = [
      ['deleteRound', 'Financement introuvable.', (s, u, id) => s.deleteRound(u, id), 'r1'],
      ['removeHolder', 'Détenteur introuvable.', (s, u, id) => s.removeHolder(u, id), 'h1'],
      [
        'recordEquityChange',
        'Détenteur introuvable.',
        (s, u, id) => s.recordEquityChange(u, id, 1000, 'Augmentation', new Date('2026-10-01')),
        'h1',
      ],
      [
        'recordDividend',
        'Détenteur introuvable.',
        (s, u, id) => s.recordDividend(u, id, 500, new Date('2026-10-01')),
        'h1',
      ],
    ];

    it.each(APPELS)(
      '%s : même 404 « %s », que la ligne existe ou non, en autant de requêtes',
      async (_nom, message, appel, id) => {
        const avant = requetes(prisma);
        const existante = await refus(appel(service, INCONNU, id));
        const pourExistante = requetes(prisma) - avant;
        const absente = await refus(appel(service, INCONNU, 'absent'));
        const pourAbsente = requetes(prisma) - avant - pourExistante;

        expect(existante).toBeInstanceOf(NotFoundException);
        expect(existante.message).toBe(message);
        expect(existante.getResponse?.()).toEqual(absente.getResponse?.());
        expect(pourExistante).toBe(pourAbsente);
        expect(prisma.financing_rounds.delete).not.toHaveBeenCalled();
        expect(prisma.equity_holders.delete).not.toHaveBeenCalled();
      },
    );

    it.each(APPELS)('%s : un associé garde son 403, il voit déjà le projet', async (_nom, _message, appel, id) => {
      await expect(appel(service, 'associe', id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('le propriétaire supprime toujours un tour et un détenteur', async () => {
      await service.deleteRound(PROPRIO, 'r1');
      await service.removeHolder(PROPRIO, 'h1');

      expect(prisma.financing_rounds.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(prisma.equity_holders.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
    });
  });
});
