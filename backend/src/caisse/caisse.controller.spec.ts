import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CaisseController } from './caisse.controller.js';
import { CaisseService } from './caisse.service.js';

describe('CaisseController', () => {
  let controller: CaisseController;
  let caisseService: Record<string, ReturnType<typeof vi.fn>>;
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    caisseService = {
      recordDay: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaisseController],
      providers: [{ provide: CaisseService, useValue: caisseService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CaisseController>(CaisseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('recordDay convertit la date et transmet les montants', async () => {
    await controller.recordDay(currentUser, {
      occurredOn: '2026-10-01',
      cashCents: 5000,
      cardCents: 3000,
      vatCents: 1300,
      note: 'Journée normale',
    });

    expect(caisseService.recordDay).toHaveBeenCalledWith('u1', {
      occurredOn: new Date('2026-10-01'),
      cashCents: 5000,
      cardCents: 3000,
      vatCents: 1300,
      note: 'Journée normale',
    });
  });

  it('list délègue directement au service', async () => {
    await controller.list(currentUser);

    expect(caisseService.list).toHaveBeenCalledWith('u1');
  });
});
