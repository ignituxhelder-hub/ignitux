import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { StocksService } from './stocks.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('StocksService', () => {
  let service: StocksService;
  let prisma: {
    stock_items: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    stock_movements: { create: Mock; findMany: Mock; aggregate: Mock };
    projects: { findFirst: Mock };
  };

  beforeEach(async () => {
    prisma = {
      stock_items: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      stock_movements: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: null } }),
      },
      projects: { findFirst: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StocksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StocksService>(StocksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloisonnement', () => {
    it("ne liste que les articles de l'appelant", async () => {
      await service.listItems('u1');

      expect(prisma.stock_items.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });

    it("refuse de modifier l'article d'un autre utilisateur", async () => {
      prisma.stock_items.findFirst.mockResolvedValue(null);

      await expect(service.updateItem('u2', 'i1', { name: 'Farine' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse de rattacher un article au projet de quelqu’un d’autre', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);

      await expect(
        service.createItem('u1', { name: 'Farine', projectId: 'p-autrui' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuse un mouvement sur un article introuvable', async () => {
      prisma.stock_items.findFirst.mockResolvedValue(null);

      await expect(service.recordMovement('u1', 'introuvable', { quantity: 5 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('recalcul du solde', () => {
    it('recalcule la quantité depuis la somme des mouvements plutôt que de l’incrémenter', async () => {
      prisma.stock_items.findFirst.mockResolvedValue({ id: 'i1', owner_id: 'u1' });
      prisma.stock_movements.aggregate.mockResolvedValue({ _sum: { quantity: 42 } });

      await service.recordMovement('u1', 'i1', { quantity: -8, reason: 'casse' });

      expect(prisma.stock_movements.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ item_id: 'i1', quantity: -8 }) }),
      );
      expect(prisma.stock_items.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { quantity: 42 },
      });
    });

    it('retombe sur zéro quand aucun mouvement n’existe encore', async () => {
      prisma.stock_items.findFirst.mockResolvedValue({ id: 'i1', owner_id: 'u1' });
      prisma.stock_movements.aggregate.mockResolvedValue({ _sum: { quantity: null } });

      await service.recordMovement('u1', 'i1', { quantity: 10 });

      expect(prisma.stock_items.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { quantity: 0 },
      });
    });
  });
});
