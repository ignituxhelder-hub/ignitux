import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EquipeController } from './equipe.controller.js';

const USER = { id: 'u1', email: 'u@exemple.fr' } as never;

describe('EquipeController', () => {
  function monter() {
    const equipe = {
      monAcces: vi.fn().mockResolvedValue({ role: 'proprietaire', capacites: [] }),
      lister: vi.fn().mockResolvedValue([]),
      inviter: vi.fn().mockResolvedValue({ id: 'pc1' }),
      changerRole: vi.fn().mockResolvedValue(undefined),
      retirer: vi.fn().mockResolvedValue(undefined),
    };
    return { equipe, controller: new EquipeController(equipe as never) };
  }

  it('protège ses routes par la connexion', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EquipeController)).toContain(JwtAuthGuard);
  });

  it('délègue chaque route avec l’identifiant de la personne connectée', async () => {
    const { controller, equipe } = monter();
    await controller.monAcces(USER, 'p1');
    await controller.lister(USER, 'p1');
    await controller.inviter(USER, 'p1', { email: 'b@exemple.fr', role: 'salarie' });
    await controller.changerRole(USER, 'p1', 'u2', { role: 'comptable' });
    await controller.retirer(USER, 'p1', 'u2');

    expect(equipe.monAcces).toHaveBeenCalledWith('u1', 'p1');
    expect(equipe.lister).toHaveBeenCalledWith('u1', 'p1');
    expect(equipe.inviter).toHaveBeenCalledWith('u1', 'p1', 'b@exemple.fr', 'salarie');
    expect(equipe.changerRole).toHaveBeenCalledWith('u1', 'p1', 'u2', 'comptable');
    expect(equipe.retirer).toHaveBeenCalledWith('u1', 'p1', 'u2');
  });
});
