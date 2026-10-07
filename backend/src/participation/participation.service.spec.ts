import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ParticipationService } from './participation.service.js';

/**
 * UNE BASE EN MÉMOIRE, juste assez fidèle pour ce service.
 *
 * On ne simule pas chaque appel un par un : on veut que « IGNITUX passe de
 * 49 % à 0 %, puis un dividende est constaté » se déroule vraiment, avec
 * ce que chaque étape a écrit pour la suivante. Seules les requêtes que le
 * service utilise sont supportées : égalité sur des champs plats, `in`,
 * `not`, et un tri sur une clé.
 */
class FakeTable {
  rows: Array<Record<string, any>> = [];
  private sequence = 0;

  constructor(
    private readonly defaults: () => Record<string, unknown> = () => ({}),
    private readonly prefix = 'id',
  ) {}

  private matches(row: Record<string, any>, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (key === 'OR') return (expected as Array<Record<string, any>>).some((w) => this.matches(row, w));
      // `assertHasProjectAccess` interroge les collaborateurs : aucun ici.
      if (key === 'collaborators') return false;
      const actual = row[key];
      if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
        if ('in' in expected) return (expected.in as unknown[]).includes(actual);
        if ('not' in expected) return actual !== expected.not;
      }
      if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
      return actual === expected;
    });
  }

  async create({ data }: { data: Record<string, any> }) {
    this.sequence += 1;
    const row = {
      id: `${this.prefix}-${this.sequence}`,
      created_at: new Date(Date.now() + this.sequence),
      ...this.defaults(),
      ...data,
    };
    this.rows.push(row);
    return row;
  }

  async findMany({ where, orderBy }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> } = {}) {
    const found = this.rows.filter((row) => this.matches(row, where));
    if (orderBy) {
      const [key, direction] = Object.entries(orderBy)[0];
      found.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
    }
    return found;
  }

  async findFirst({ where }: { where?: Record<string, any> } = {}) {
    return this.rows.find((row) => this.matches(row, where)) ?? null;
  }

  findUnique(args: { where: Record<string, any> }) {
    return this.findFirst(args);
  }

  async update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
    const row = this.rows.find((candidate) => this.matches(candidate, where));
    if (!row) throw new Error('update : ligne introuvable');
    Object.assign(row, data);
    return row;
  }

  async count({ where }: { where?: Record<string, any> } = {}) {
    return this.rows.filter((row) => this.matches(row, where)).length;
  }
}

const OWNER = { id: 'u-owner', email: 'porteur@x.test' };
const OPERATOR = { id: 'u-op', email: 'ops@ignitux.test' };
const STRANGER = { id: 'u-stranger', email: 'autre@x.test' };

describe('ParticipationService', () => {
  let service: ParticipationService;
  let db: Record<string, FakeTable> & { $transaction: (fn: (tx: unknown) => unknown) => unknown };
  let operateursInitiaux: string | undefined;

  beforeEach(async () => {
    operateursInitiaux = process.env.IGNITUX_OPERATEURS;
    process.env.IGNITUX_OPERATEURS = OPERATOR.email;

    const tables = {
      projects: new FakeTable(),
      project_collaborators: new FakeTable(),
      equity_holders: new FakeTable(() => ({ is_founder: false }), 'holder'),
      equity_events: new FakeTable(() => ({}), 'event'),
      participation_agreements: new FakeTable(() => ({ status: 'actif', ecosystem_offre: 'construction' }), 'agr'),
      participation_milestones: new FakeTable(
        () => ({ status: 'prevu', conditions: [], equity_event_ids: [], validated_at: null }),
        'ms',
      ),
      dividend_right_entries: new FakeTable(() => ({ status: 'du', settled_on: null }), 'div'),
      constitution_violations: { createMany: vi.fn() },
    };
    tables.projects.rows.push({ id: 'p1', owner_id: OWNER.id });
    db = Object.assign(tables, { $transaction: (fn: (tx: unknown) => unknown) => fn(tables) }) as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [ParticipationService, ConstitutionService, { provide: PrismaService, useValue: db }],
    }).compile();
    service = module.get(ParticipationService);
  });

  afterEach(() => {
    if (operateursInitiaux === undefined) delete process.env.IGNITUX_OPERATEURS;
    else process.env.IGNITUX_OPERATEURS = operateursInitiaux;
    vi.useRealTimers();
  });

  const EFFECTIVE = new Date('2026-10-01T00:00:00.000Z');

  const createAgreement = (overrides: Record<string, unknown> = {}) =>
    service.createAgreement(OPERATOR, 'p1', {
      founderName: 'Camille Porteuse',
      effectiveOn: EFFECTIVE,
      ...overrides,
    });

  async function currentShares() {
    const { capital } = await service.getParticipation(OWNER.id, 'p1');
    return Object.fromEntries(
      capital!.holders.map((holder) => [holder.isFounder ? 'founder' : 'ignitux', holder.shareBasisPoints]),
    ) as { founder: number | null; ignitux: number | null };
  }

  /** Prévoit, valide et exécute un palier — le chemin complet côté IGNITUX. */
  async function passerLePalier(targetIgnituxBasisPoints: number, effectiveOn: Date) {
    const milestone = await service.addMilestone(OPERATOR, 'p1', {
      label: `vers ${targetIgnituxBasisPoints}`,
      targetIgnituxBasisPoints,
      conditions: ['Condition définie pour ce projet'],
    });
    await service.validateMilestone(OPERATOR, milestone.id, 'Conditions constatées');
    return service.executeMilestone(OPERATOR, milestone.id, effectiveOn);
  }

  describe('créer l’accord', () => {
    it('part de 51/49 par défaut et l’écrit dans le capital', async () => {
      await createAgreement();

      await expect(currentShares()).resolves.toEqual({ founder: 5100, ignitux: 4900 });
      expect(db.equity_events.rows).toHaveLength(2);
    });

    it('copie les valeurs par défaut DANS l’accord : droit à 5 %, offre construction', async () => {
      const agreement = await createAgreement();

      expect(agreement).toMatchObject({
        initial_founder_bps: 5100,
        initial_ignitux_bps: 4900,
        dividend_right_bps: 500,
        ecosystem_offre: 'construction',
        status: 'actif',
      });
    });

    it('accepte une autre répartition de départ, un autre taux et une autre offre', async () => {
      const agreement = await createAgreement({
        founderBasisPoints: 6000,
        ignituxBasisPoints: 4000,
        dividendRightBasisPoints: 300,
        ecosystemOffre: 'entrepreneur',
      });

      expect(agreement).toMatchObject({
        initial_founder_bps: 6000,
        initial_ignitux_bps: 4000,
        dividend_right_bps: 300,
        ecosystem_offre: 'entrepreneur',
      });
      await expect(currentShares()).resolves.toEqual({ founder: 6000, ignitux: 4000 });
    });

    it('refuse un départ où le porteur n’est pas majoritaire', async () => {
      await expect(createAgreement({ founderBasisPoints: 5000, ignituxBasisPoints: 5000 })).rejects.toThrow(
        BadRequestException,
      );
      expect(db.participation_agreements.rows).toHaveLength(0);
    });

    it('refuse une offre inconnue du catalogue', async () => {
      await expect(createAgreement({ ecosystemOffre: 'gratuit-a-vie' })).rejects.toThrow(BadRequestException);
    });

    it('est réservé à IGNITUX : l’entrepreneur ne s’écrit pas son propre accord', async () => {
      await expect(
        service.createAgreement(OWNER, 'p1', { founderName: 'Moi', effectiveOn: EFFECTIVE }),
      ).rejects.toThrow(ForbiddenException);
      expect(db.participation_agreements.rows).toHaveLength(0);
    });

    it('refuse un second accord sur le même projet', async () => {
      await createAgreement();
      await expect(createAgreement()).rejects.toThrow(ConflictException);
    });

    it('refuse un projet dont le capital a déjà été saisi à la main', async () => {
      await db.equity_holders.create({ data: { project_id: 'p1', name: 'Déjà là', is_founder: true } });

      await expect(createAgreement()).rejects.toThrow(/déjà/);
    });

    it('refuse un projet inexistant', async () => {
      await expect(service.createAgreement(OPERATOR, 'absent', { founderName: 'X', effectiveOn: EFFECTIVE })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('prévoir un palier', () => {
    beforeEach(async () => {
      await createAgreement();
    });

    it('accepte n’importe quelle part inférieure à la part actuelle', async () => {
      const milestone = await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 3733,
        conditions: ['Écrite pour ce projet'],
      });

      expect(milestone).toMatchObject({ position: 1, target_ignitux_bps: 3733, status: 'prevu' });
    });

    it('accepte un palier sans condition : « conditions à définir », rien d’inventé', async () => {
      const milestone = await service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 2000 });

      expect(milestone.conditions).toEqual([]);
    });

    it('refuse que la part d’IGNITUX remonte ou reste identique', async () => {
      await expect(service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 4900 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 5500 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('enchaîne les paliers : chacun doit viser moins que le précédent prévu', async () => {
      await service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 3000 });

      await expect(service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 3500 })).rejects.toThrow(
        BadRequestException,
      );
      const second = await service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 1000 });
      expect(second.position).toBe(2);
    });

    it('est réservé à IGNITUX', async () => {
      await expect(service.addMilestone(OWNER, 'p1', { targetIgnituxBasisPoints: 2000 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('n’existe pas sans accord', async () => {
      db.projects.rows.push({ id: 'p2', owner_id: OWNER.id });
      await expect(service.addMilestone(OPERATOR, 'p2', { targetIgnituxBasisPoints: 2000 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('valider un palier', () => {
    let milestoneId: string;

    beforeEach(async () => {
      await createAgreement();
      const milestone = await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 3000,
        conditions: ['Condition A'],
      });
      milestoneId = milestone.id;
    });

    it('enregistre qui, côté IGNITUX, a validé — et quand', async () => {
      const validated = await service.validateMilestone(OPERATOR, milestoneId, 'Conditions constatées');

      expect(validated).toMatchObject({
        status: 'valide',
        validated_by: OPERATOR.id,
        validation_note: 'Conditions constatées',
      });
      expect(validated.validated_at).toBeInstanceOf(Date);
    });

    it('ne peut pas être fait par l’entrepreneur, même propriétaire du projet', async () => {
      await expect(service.validateMilestone(OWNER, milestoneId, 'Je valide moi-même')).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.participation_milestones.rows[0].status).toBe('prevu');
    });

    it('refuse un palier sans condition définie', async () => {
      const vide = await service.addMilestone(OPERATOR, 'p1', { targetIgnituxBasisPoints: 1000 });

      await expect(service.validateMilestone(OPERATOR, vide.id, 'Rien à vérifier')).rejects.toThrow(/condition/i);
    });

    it('refuse de valider un palier dont le précédent n’est pas exécuté', async () => {
      const second = await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 1000,
        conditions: ['Condition B'],
      });

      await expect(service.validateMilestone(OPERATOR, second.id, 'Trop tôt')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuse de valider deux fois', async () => {
      await service.validateMilestone(OPERATOR, milestoneId, 'Une fois');
      await expect(service.validateMilestone(OPERATOR, milestoneId, 'Deux fois')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('la prise de connaissance de l’entrepreneur ne valide rien', async () => {
      const connu = await service.acknowledgeMilestone(OWNER.id, milestoneId);

      expect(connu.founder_acknowledged_at).toBeInstanceOf(Date);
      expect(connu.status).toBe('prevu');
      await expect(service.executeMilestone(OPERATOR, milestoneId, EFFECTIVE)).rejects.toThrow(BadRequestException);
    });

    it('la prise de connaissance est refusée à quelqu’un d’étranger au projet', async () => {
      await expect(service.acknowledgeMilestone(STRANGER.id, milestoneId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exécuter un palier', () => {
    beforeEach(async () => {
      await createAgreement();
    });

    it('refuse un palier non validé', async () => {
      const milestone = await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 3000,
        conditions: ['A'],
      });

      await expect(service.executeMilestone(OPERATOR, milestone.id, EFFECTIVE)).rejects.toThrow(BadRequestException);
      await expect(currentShares()).resolves.toEqual({ founder: 5100, ignitux: 4900 });
    });

    it('écrit les deux nouvelles parts et CONSERVE l’historique', async () => {
      await passerLePalier(3000, new Date('2027-03-01T00:00:00.000Z'));

      await expect(currentShares()).resolves.toEqual({ founder: 7000, ignitux: 3000 });
      // 2 événements de départ + 2 du palier : rien n'a été écrasé.
      expect(db.equity_events.rows).toHaveLength(4);
      const milestone = db.participation_milestones.rows[0];
      expect(milestone.status).toBe('execute');
      expect(milestone.equity_event_ids).toHaveLength(2);
      expect(milestone.effective_on).toEqual(new Date('2027-03-01T00:00:00.000Z'));
    });

    it('ne fait pas passer l’accord à « transmis » avant 0 %', async () => {
      await passerLePalier(1000, new Date('2027-03-01T00:00:00.000Z'));

      const agreement = db.participation_agreements.rows[0];
      expect(agreement.status).toBe('actif');
      // La vraie base renvoie null ; la base en mémoire n'a simplement pas la clé.
      expect(agreement.transmitted_on ?? null).toBeNull();
    });

    it('passe l’accord à « transmis » exactement quand IGNITUX atteint 0 %', async () => {
      const effective = new Date('2029-05-01T00:00:00.000Z');
      await passerLePalier(0, effective);

      await expect(currentShares()).resolves.toEqual({ founder: 10000, ignitux: 0 });
      expect(db.participation_agreements.rows[0]).toMatchObject({ status: 'transmis', transmitted_on: effective });
    });

    it('est réservé à IGNITUX', async () => {
      const milestone = await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 3000,
        conditions: ['A'],
      });
      await service.validateMilestone(OPERATOR, milestone.id, 'ok');

      await expect(service.executeMilestone(OWNER, milestone.id, EFFECTIVE)).rejects.toThrow(ForbiddenException);
    });

    it('refuse d’exécuter deux fois le même palier', async () => {
      const milestone = await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 3000,
        conditions: ['A'],
      });
      await service.validateMilestone(OPERATOR, milestone.id, 'ok');
      await service.executeMilestone(OPERATOR, milestone.id, EFFECTIVE);

      await expect(service.executeMilestone(OPERATOR, milestone.id, EFFECTIVE)).rejects.toThrow(BadRequestException);
    });
  });

  describe('aucune règle de temps', () => {
    it('dix ans plus tard, un palier non validé n’a rien changé au capital', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00.000Z') });
      await createAgreement();
      await service.addMilestone(OPERATOR, 'p1', {
        targetIgnituxBasisPoints: 3000,
        conditions: ['A'],
      });

      vi.setSystemTime(new Date('2036-10-01T00:00:00.000Z'));

      const { capital, milestones } = await service.getParticipation(OWNER.id, 'p1');
      expect(milestones![0].status).toBe('prevu');
      expect(capital!.holders.find((h) => !h.isFounder)!.shareBasisPoints).toBe(4900);
    });
  });

  describe('le droit économique sur les dividendes', () => {
    beforeEach(async () => {
      await createAgreement();
    });

    it('est refusé tant qu’IGNITUX détient du capital', async () => {
      await expect(
        service.recordDistributedDividend(OWNER.id, 'p1', { distributedCents: 1_000_000, occurredOn: EFFECTIVE }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(db.dividend_right_entries.rows).toHaveLength(0);
    });

    it('reste refusé à 12 % : seul 0 % l’ouvre', async () => {
      await passerLePalier(1200, EFFECTIVE);

      await expect(
        service.recordDistributedDividend(OWNER.id, 'p1', { distributedCents: 1_000_000, occurredOn: EFFECTIVE }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('après 100/0 : 10 000 € distribués → 500 € pour IGNITUX, 9 500 € pour l’entrepreneur', async () => {
      await passerLePalier(0, EFFECTIVE);

      const entry = await service.recordDistributedDividend(OWNER.id, 'p1', {
        distributedCents: 1_000_000,
        occurredOn: new Date('2030-06-30T00:00:00.000Z'),
      });

      expect(entry).toMatchObject({
        distributed_cents: 1_000_000,
        right_bps: 500,
        due_cents: 50_000,
        status: 'du',
      });
    });

    it('utilise le taux de l’accord, pas une constante', async () => {
      db.participation_agreements.rows[0].dividend_right_bps = 300;
      await passerLePalier(0, EFFECTIVE);

      const entry = await service.recordDistributedDividend(OWNER.id, 'p1', {
        distributedCents: 1_000_000,
        occurredOn: EFFECTIVE,
      });

      expect(entry.due_cents).toBe(30_000);
      expect(entry.right_bps).toBe(300);
    });

    it('aucun dividende distribué : aucune ligne, aucun paiement', async () => {
      await passerLePalier(0, EFFECTIVE);

      await expect(
        service.recordDistributedDividend(OWNER.id, 'p1', { distributedCents: 0, occurredOn: EFFECTIVE }),
      ).rejects.toThrow(BadRequestException);
      expect(db.dividend_right_entries.rows).toHaveLength(0);
    });

    it('n’est jamais écrit dans le capital', async () => {
      await passerLePalier(0, EFFECTIVE);
      const evenementsAvant = db.equity_events.rows.length;
      const detenteursAvant = db.equity_holders.rows.length;

      await service.recordDistributedDividend(OWNER.id, 'p1', { distributedCents: 1_000_000, occurredOn: EFFECTIVE });

      expect(db.equity_events.rows).toHaveLength(evenementsAvant);
      expect(db.equity_holders.rows).toHaveLength(detenteursAvant);
      await expect(currentShares()).resolves.toEqual({ founder: 10000, ignitux: 0 });
    });

    it('ne peut être constaté que par le porteur du projet', async () => {
      await passerLePalier(0, EFFECTIVE);

      await expect(
        service.recordDistributedDividend(STRANGER.id, 'p1', { distributedCents: 1_000_000, occurredOn: EFFECTIVE }),
      ).rejects.toThrow(NotFoundException);
    });

    it('se règle côté IGNITUX uniquement', async () => {
      await passerLePalier(0, EFFECTIVE);
      const entry = await service.recordDistributedDividend(OWNER.id, 'p1', {
        distributedCents: 1_000_000,
        occurredOn: EFFECTIVE,
      });

      await expect(service.settleDividendRight(OWNER, entry.id, EFFECTIVE)).rejects.toThrow(ForbiddenException);
      const reglee = await service.settleDividendRight(OPERATOR, entry.id, new Date('2030-07-15T00:00:00.000Z'));
      expect(reglee).toMatchObject({ status: 'regle', settled_on: new Date('2030-07-15T00:00:00.000Z') });
      await expect(service.settleDividendRight(OPERATOR, entry.id, EFFECTIVE)).rejects.toThrow(BadRequestException);
    });
  });

  describe('lire la participation', () => {
    it('renvoie « pas d’accord » pour un projet qui n’en a pas', async () => {
      await expect(service.getParticipation(OWNER.id, 'p1')).resolves.toEqual({ agreement: null });
    });

    it('refuse un étranger au projet', async () => {
      await createAgreement();
      await expect(service.getParticipation(STRANGER.id, 'p1')).rejects.toThrow(NotFoundException);
    });

    it('sépare capital, droit économique et accès à l’écosystème', async () => {
      await createAgreement();

      const view = await service.getParticipation(OWNER.id, 'p1');

      expect(view.phase).toBe('partagee');
      expect(view.capital!.holders.map((h) => h.shareBasisPoints).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([4900, 5100]);
      expect(view.dividendRight).toMatchObject({
        rightBasisPoints: 500,
        active: false,
        entries: [],
        totalDueCents: 0,
      });
      expect(view.ecosystem).toMatchObject({ offre: 'construction', active: true });
    });

    it('après 100/0 : capital à 0 %, droit actif, accès à l’écosystème conservé', async () => {
      await createAgreement();
      await passerLePalier(0, EFFECTIVE);
      await service.recordDistributedDividend(OWNER.id, 'p1', { distributedCents: 1_000_000, occurredOn: EFFECTIVE });

      const view = await service.getParticipation(OWNER.id, 'p1');

      expect(view.phase).toBe('transmise');
      expect(view.capital!.holders.find((h) => !h.isFounder)!.shareBasisPoints).toBe(0);
      expect(view.dividendRight).toMatchObject({ active: true, totalDueCents: 50_000, totalSettledCents: 0 });
      expect(view.ecosystem).toMatchObject({ offre: 'construction', active: true });
    });

    it('expose l’historique complet des changements de capital', async () => {
      await createAgreement();
      await passerLePalier(3000, new Date('2027-03-01T00:00:00.000Z'));

      const view = await service.getParticipation(OWNER.id, 'p1');

      expect(view.history!.map((event) => [event.holderName, event.shareBasisPoints])).toEqual([
        ['Camille Porteuse', 5100],
        ['IGNITUX', 4900],
        ['Camille Porteuse', 7000],
        ['IGNITUX', 3000],
      ]);
    });
  });

  describe('parcours complet, avec d’autres pourcentages que ceux de l’exemple', () => {
    it('51/49 → 64/36 → 88/12 → 100/0, puis un dividende : 9 500 € / 500 €', async () => {
      await createAgreement();

      await passerLePalier(3600, new Date('2027-02-10T00:00:00.000Z'));
      await expect(currentShares()).resolves.toEqual({ founder: 6400, ignitux: 3600 });

      await passerLePalier(1200, new Date('2028-09-03T00:00:00.000Z'));
      await expect(currentShares()).resolves.toEqual({ founder: 8800, ignitux: 1200 });

      await passerLePalier(0, new Date('2031-01-20T00:00:00.000Z'));
      await expect(currentShares()).resolves.toEqual({ founder: 10000, ignitux: 0 });

      const entry = await service.recordDistributedDividend(OWNER.id, 'p1', {
        distributedCents: 1_000_000,
        occurredOn: new Date('2031-12-31T00:00:00.000Z'),
      });
      expect(entry.due_cents).toBe(50_000);
      expect(1_000_000 - entry.due_cents).toBe(950_000);

      const view = await service.getParticipation(OWNER.id, 'p1');
      expect(view.ecosystem).toMatchObject({ offre: 'construction', active: true });
      // 2 événements de départ + 3 paliers × 2 : toute l'histoire est là.
      expect(view.history).toHaveLength(8);
    });
  });
});
