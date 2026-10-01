import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../roles/role.guard.js';
import { fileFilter, IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';

describe('IdentiteController', () => {
  let controller: IdentiteController;
  // Typé en dictionnaire plutôt qu'avec les méthodes précises : les Tasks 5
  // et 6 ajoutent des méthodes à ce même mock (listerEnAttente,
  // revoirVerification...) sans revenir modifier cette déclaration — un
  // type figé sur les seules méthodes de cette task casserait la
  // compilation dès la prochaine.
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = { soumettreDocumentPourUtilisateur: vi.fn(), listerMesVerifications: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentiteController],
      providers: [{ provide: IdentiteService, useValue: service }],
    })
      // Même convention que crm/caisse/stocks : JwtAuthGuard étend
      // AuthGuard('jwt') de @nestjs/passport, qui dépend d'AuthModuleOptions
      // fourni par PassportModule — absent de ce module de test isolé. Ces
      // tests portent sur la délégation au service, pas sur la garde elle-même.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      // RoleGuard dépend de RolesService (via RolesModule), absent de ce
      // module isolé. Même raisonnement que pour JwtAuthGuard ci-dessus :
      // que la garde soit bien montée est vérifié à la couche e2e, pas ici.
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(IdentiteController);
  });

  const user = { id: 'user-1', email: 'a@b.c' };

  it('transmet recto/verso au service', async () => {
    service.soumettreDocumentPourUtilisateur.mockResolvedValue({ id: 'v1' });
    const front = { buffer: Buffer.from('r'), mimetype: 'image/jpeg' } as Express.Multer.File;
    const back = { buffer: Buffer.from('v'), mimetype: 'image/jpeg' } as Express.Multer.File;

    await controller.soumettre(user, { documentType: 'carte_identite' }, {
      front: [front],
      back: [back],
    });

    expect(service.soumettreDocumentPourUtilisateur).toHaveBeenCalledWith(
      'user-1',
      'carte_identite',
      front.buffer,
      back.buffer,
    );
  });

  it('rejette si aucun fichier recto n’est fourni', async () => {
    await expect(
      controller.soumettre(user, { documentType: 'passeport' }, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('liste les vérifications de l’utilisateur courant', async () => {
    service.listerMesVerifications.mockResolvedValue([]);
    await controller.mesVerifications(user);
    expect(service.listerMesVerifications).toHaveBeenCalledWith('user-1');
  });

  it('expose la file en attente', async () => {
    service.listerEnAttente = vi.fn().mockResolvedValue([]);
    await controller.enAttente();
    expect(service.listerEnAttente).toHaveBeenCalled();
  });

  it('transmet la décision de revue', async () => {
    service.revoirVerification = vi.fn().mockResolvedValue({ id: 'v1' });
    await controller.revoir('v1', { decision: 'rejetee', motif: 'photo illisible' });
    expect(service.revoirVerification).toHaveBeenCalledWith('v1', 'rejetee', 'photo illisible');
  });
});

describe('fileFilter', () => {
  it('rejette un fichier qui n’est ni JPEG ni PNG', () => {
    const callback = vi.fn();
    fileFilter(null, { mimetype: 'application/pdf' } as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('accepte un fichier JPEG', () => {
    const callback = vi.fn();
    fileFilter(null, { mimetype: 'image/jpeg' } as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('accepte un fichier PNG', () => {
    const callback = vi.fn();
    fileFilter(null, { mimetype: 'image/png' } as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
