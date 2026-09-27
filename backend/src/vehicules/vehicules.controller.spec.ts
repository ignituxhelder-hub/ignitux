import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { VehiculesController } from './vehicules.controller.js';
import { VehiculesService } from './vehicules.service.js';

describe('VehiculesController', () => {
  let controller: VehiculesController;
  let vehiculesService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    vehiculesService = {
      createVehicle: vi.fn().mockResolvedValue({}),
      listVehicles: vi.fn().mockResolvedValue([]),
      updateVehicle: vi.fn().mockResolvedValue({}),
      deleteVehicle: vi.fn().mockResolvedValue(undefined),
      recordEntry: vi.fn().mockResolvedValue({}),
      listEntries: vi.fn().mockResolvedValue({ entries: [], totalCostCents: 0, costPerKmCents: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiculesController],
      providers: [{ provide: VehiculesService, useValue: vehiculesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VehiculesController>(VehiculesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createVehicle transmet les champs à plat', async () => {
    await controller.createVehicle(currentUser, { label: 'Fourgon', plate: 'AA-123-BB' });

    expect(vehiculesService.createVehicle).toHaveBeenCalledWith('u1', {
      label: 'Fourgon',
      plate: 'AA-123-BB',
    });
  });

  it('recordEntry convertit la date fournie', async () => {
    await controller.recordEntry(currentUser, 'v1', {
      costCents: 12000,
      odometerKm: 5000,
      reason: 'vidange',
      occurredOn: '2026-09-10',
    });

    expect(vehiculesService.recordEntry).toHaveBeenCalledWith('u1', 'v1', {
      costCents: 12000,
      odometerKm: 5000,
      reason: 'vidange',
      occurredOn: new Date('2026-09-10'),
    });
  });

  it('les autres routes délèguent directement au service', async () => {
    await controller.listVehicles(currentUser);
    await controller.updateVehicle(currentUser, 'v1', { label: 'Camion' });
    await controller.deleteVehicle(currentUser, 'v1');
    await controller.listEntries(currentUser, 'v1');

    expect(vehiculesService.listVehicles).toHaveBeenCalledWith('u1');
    expect(vehiculesService.updateVehicle).toHaveBeenCalledWith('u1', 'v1', {
      label: 'Camion',
      plate: undefined,
    });
    expect(vehiculesService.deleteVehicle).toHaveBeenCalledWith('u1', 'v1');
    expect(vehiculesService.listEntries).toHaveBeenCalledWith('u1', 'v1');
  });
});
