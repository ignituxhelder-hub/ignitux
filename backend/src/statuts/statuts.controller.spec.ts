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

  it('transmet l’édition du texte', async () => {
    service.modifierTexte = vi.fn().mockResolvedValue({ id: 'b1' });
    await controller.modifier(user, 'p1', { content: 'nouveau texte' });
    expect(service.modifierTexte).toHaveBeenCalledWith('user-1', 'p1', 'nouveau texte');
  });

  it('transmet la régénération', async () => {
    const dto = { capitalCents: 100000, headOffice: 'Paris', durationYears: 99, associates: [{ fullName: 'A', shareBasisPoints: 10000 }] };
    service.regenererPourProjet = vi.fn().mockResolvedValue({ id: 'b1' });
    await controller.regenerer(user, 'p1', dto);
    expect(service.regenererPourProjet).toHaveBeenCalledWith('user-1', 'p1', dto);
  });

  it('transmet la rétention', async () => {
    service.retenirPourProjet = vi.fn().mockResolvedValue({ id: 'b1' });
    await controller.retenir(user, 'p1');
    expect(service.retenirPourProjet).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('expose la lecture pour le projet', async () => {
    service.obtenirPourProjet = vi.fn().mockResolvedValue(null);
    await controller.obtenir(user, 'p1');
    expect(service.obtenirPourProjet).toHaveBeenCalledWith('user-1', 'p1');
  });
});
