import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ImmobilierService } from './immobilier.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('ImmobilierService', () => {
  let service: ImmobilierService;
  let prisma: {
    real_estate_properties: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    real_estate_movements: { create: Mock; findMany: Mock; aggregate: Mock };
    projects: { findFirst: Mock };
  };

  beforeEach(async () => {
    prisma = {
      real_estate_properties: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      real_estate_movements: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount_cents: null } }),
      },
      projects: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ImmobilierService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ImmobilierService>(ImmobilierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloisonnement', () => {
    it("ne liste que les biens de l'appelant", async () => {
      await service.listProperties('u1');

      expect(prisma.real_estate_properties.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });

    it("refuse de modifier le bien d'un autre utilisateur", async () => {
      prisma.real_estate_properties.findFirst.mockResolvedValue(null);

      await expect(service.updateProperty('u2', 'p1', { label: 'Studio' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse de rattacher un bien au projet de quelqu’un d’autre', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.createProperty('u1', { label: 'Studio', projectId: 'p-autrui' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuse un mouvement sur un bien introuvable', async () => {
      prisma.real_estate_properties.findFirst.mockResolvedValue(null);

      await expect(
        service.recordMovement('u1', 'introuvable', { amountCents: 50000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recalcul du solde', () => {
    it('recalcule le solde depuis la somme des mouvements plutôt que de l’incrémenter', async () => {
      prisma.real_estate_properties.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.real_estate_movements.aggregate.mockResolvedValue({ _sum: { amount_cents: 42000 } });

      await service.recordMovement('u1', 'p1', { amountCents: -8000, reason: 'plomberie' });

      expect(prisma.real_estate_movements.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ property_id: 'p1', amount_cents: -8000 }),
        }),
      );
      expect(prisma.real_estate_properties.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { balance_cents: 42000 },
      });
    });

    it('retombe sur zéro quand aucun mouvement n’existe encore', async () => {
      prisma.real_estate_properties.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'u1' });
      prisma.real_estate_movements.aggregate.mockResolvedValue({ _sum: { amount_cents: null } });

      await service.recordMovement('u1', 'p1', { amountCents: 100000 });

      expect(prisma.real_estate_properties.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { balance_cents: 0 },
      });
    });
  });
});
