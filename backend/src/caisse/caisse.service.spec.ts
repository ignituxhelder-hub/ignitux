import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CaisseService } from './caisse.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('CaisseService', () => {
  let service: CaisseService;
  let prisma: {
    cash_register_entries: { create: Mock; findMany: Mock };
    ledger_accounts: { findFirst: Mock };
  };
  let ledger: { openAccount: Mock; recordEntry: Mock };

  beforeEach(async () => {
    prisma = {
      cash_register_entries: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      ledger_accounts: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    ledger = {
      openAccount: vi.fn().mockImplementation((_owner, seed) =>
        Promise.resolve({ id: `compte-${seed.code}`, ...seed }),
      ),
      recordEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaisseService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
      ],
    }).compile();

    service = module.get<CaisseService>(CaisseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validation', () => {
    it('refuse un relevé sans aucun montant', async () => {
      await expect(
        service.recordDay('u1', { occurredOn: new Date('2026-10-01'), cashCents: 0, cardCents: 0, vatCents: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse une TVA supérieure au total encaissé', async () => {
      await expect(
        service.recordDay('u1', {
          occurredOn: new Date('2026-10-01'),
          cashCents: 1000,
          cardCents: 0,
          vatCents: 2000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('les comptes', () => {
    it('ouvre les comptes manquants à la volée', async () => {
      await service.recordDay('u1', {
        occurredOn: new Date('2026-10-01'),
        cashCents: 5000,
        cardCents: 3000,
        vatCents: 1300,
      });

      const codesOuverts = ledger.openAccount.mock.calls.map(([, seed]) => seed.code);
      expect(codesOuverts).toEqual(expect.arrayContaining(['530', '511', '4457', '707']));
    });

    it('réutilise un compte déjà ouvert plutôt que d’en créer un autre', async () => {
      prisma.ledger_accounts.findFirst.mockResolvedValue({ id: 'compte-existant', code: '530' });

      await service.recordDay('u1', {
        occurredOn: new Date('2026-10-01'),
        cashCents: 5000,
        cardCents: 0,
        vatCents: 0,
      });

      expect(ledger.openAccount).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ code: '530' }),
      );
    });
  });

  describe('la répartition des lignes', () => {
    it('omet la ligne Ventes quand la TVA absorbe tout le montant', async () => {
      await service.recordDay('u1', {
        occurredOn: new Date('2026-10-01'),
        cashCents: 1000,
        cardCents: 0,
        vatCents: 1000,
      });

      const codesOuverts = ledger.openAccount.mock.calls.map(([, seed]) => seed.code);
      expect(codesOuverts).not.toContain('707');
    });

    it('construit une écriture équilibrée transmise à recordEntry', async () => {
      await service.recordDay('u1', {
        occurredOn: new Date('2026-10-01'),
        cashCents: 5000,
        cardCents: 3000,
        vatCents: 1300,
      });

      const [, input] = ledger.recordEntry.mock.calls[0];
      const debit = input.lines.reduce((total: number, l: { debitCents: number }) => total + l.debitCents, 0);
      const credit = input.lines.reduce((total: number, l: { creditCents: number }) => total + l.creditCents, 0);
      expect(debit).toBe(credit);
      expect(debit).toBe(8000);
    });

    it('enregistre l’identifiant de l’écriture sur le relevé', async () => {
      await service.recordDay('u1', {
        occurredOn: new Date('2026-10-01'),
        cashCents: 5000,
        cardCents: 0,
        vatCents: 0,
      });

      expect(prisma.cash_register_entries.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ledger_entry_id: 'entry-1' }) }),
      );
    });
  });

  describe('cloisonnement', () => {
    it("ne liste que les relevés de l'appelant", async () => {
      await service.list('u1');

      expect(prisma.cash_register_entries.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });
  });
});
