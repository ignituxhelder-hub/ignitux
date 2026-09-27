import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ImmobilierController } from './immobilier.controller.js';
import { ImmobilierService } from './immobilier.service.js';

describe('ImmobilierController', () => {
  let controller: ImmobilierController;
  let immobilierService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    immobilierService = {
      createProperty: vi.fn().mockResolvedValue({}),
      listProperties: vi.fn().mockResolvedValue([]),
      updateProperty: vi.fn().mockResolvedValue({}),
      deleteProperty: vi.fn().mockResolvedValue(undefined),
      recordMovement: vi.fn().mockResolvedValue({}),
      listMovements: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImmobilierController],
      providers: [{ provide: ImmobilierService, useValue: immobilierService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ImmobilierController>(ImmobilierController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createProperty transmet les champs à plat', async () => {
    await controller.createProperty(currentUser, { label: 'Studio', address: '1 rue A' });

    expect(immobilierService.createProperty).toHaveBeenCalledWith('u1', {
      projectId: undefined,
      label: 'Studio',
      address: '1 rue A',
    });
  });

  it('recordMovement convertit la date fournie', async () => {
    await controller.recordMovement(currentUser, 'p1', {
      amountCents: -5000,
      reason: 'charges',
      occurredOn: '2026-09-10',
    });

    expect(immobilierService.recordMovement).toHaveBeenCalledWith('u1', 'p1', {
      amountCents: -5000,
      reason: 'charges',
      occurredOn: new Date('2026-09-10'),
    });
  });

  it('les autres routes délèguent directement au service', async () => {
    await controller.listProperties(currentUser);
    await controller.updateProperty(currentUser, 'p1', { label: 'T2' });
    await controller.deleteProperty(currentUser, 'p1');
    await controller.listMovements(currentUser, 'p1');

    expect(immobilierService.listProperties).toHaveBeenCalledWith('u1');
    expect(immobilierService.updateProperty).toHaveBeenCalledWith('u1', 'p1', {
      projectId: undefined,
      label: 'T2',
      address: undefined,
    });
    expect(immobilierService.deleteProperty).toHaveBeenCalledWith('u1', 'p1');
    expect(immobilierService.listMovements).toHaveBeenCalledWith('u1', 'p1');
  });
});
