import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';

describe('StocksController', () => {
  let controller: StocksController;
  let stocksService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    stocksService = {
      createItem: vi.fn().mockResolvedValue({}),
      listItems: vi.fn().mockResolvedValue([]),
      updateItem: vi.fn().mockResolvedValue({}),
      deleteItem: vi.fn().mockResolvedValue(undefined),
      recordMovement: vi.fn().mockResolvedValue({}),
      listMovements: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StocksController],
      providers: [{ provide: StocksService, useValue: stocksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StocksController>(StocksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createItem transmet les champs à plat', async () => {
    await controller.createItem(currentUser, { name: 'Farine', unit: 'kg', alertBelow: 5 });

    expect(stocksService.createItem).toHaveBeenCalledWith('u1', {
      projectId: undefined,
      name: 'Farine',
      unit: 'kg',
      alertBelow: 5,
    });
  });

  it('recordMovement convertit la date fournie', async () => {
    await controller.recordMovement(currentUser, 'i1', {
      quantity: -3,
      reason: 'casse',
      occurredOn: '2026-09-10',
    });

    expect(stocksService.recordMovement).toHaveBeenCalledWith('u1', 'i1', {
      quantity: -3,
      reason: 'casse',
      occurredOn: new Date('2026-09-10'),
    });
  });

  it('les autres routes délèguent directement au service', async () => {
    await controller.listItems(currentUser);
    await controller.updateItem(currentUser, 'i1', { name: 'Sucre' });
    await controller.deleteItem(currentUser, 'i1');
    await controller.listMovements(currentUser, 'i1');

    expect(stocksService.listItems).toHaveBeenCalledWith('u1');
    expect(stocksService.updateItem).toHaveBeenCalledWith('u1', 'i1', {
      projectId: undefined,
      name: 'Sucre',
      unit: undefined,
      alertBelow: undefined,
    });
    expect(stocksService.deleteItem).toHaveBeenCalledWith('u1', 'i1');
    expect(stocksService.listMovements).toHaveBeenCalledWith('u1', 'i1');
  });
});
