import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StatutsController } from './statuts.controller.js';
import { StatutsService } from './statuts.service.js';

describe('StatutsController', () => {
  let controller: StatutsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const user = { id: 'user-1', email: 'a@b.c' };

  beforeEach(async () => {
    service = { genererPourProjet: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [StatutsController],
      providers: [{ provide: StatutsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(StatutsController);
  });

  it('transmet la génération au service', async () => {
    const dto = { capitalCents: 100000, headOffice: 'Paris', durationYears: 99, associates: [{ fullName: 'A', shareBasisPoints: 10000 }] };
    service.genererPourProjet.mockResolvedValue({ id: 'b1' });

    await controller.generer(user, 'p1', dto);

    expect(service.genererPourProjet).toHaveBeenCalledWith('user-1', 'p1', dto);
  });
});
