import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../roles/role.guard.js';
import { fileFilter, IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';
import { MandatsService } from './mandats.service.js';

describe('IdentiteController', () => {
  let controller: IdentiteController;
  // Typé en dictionnaire plutôt qu'avec les méthodes précises : les Tasks 5
  // et 6 ajoutent des méthodes à ce même mock (listerEnAttente,
  // revoirVerification...) sans revenir modifier cette déclaration — un
  // type figé sur les seules méthodes de cette task casserait la
  // compilation dès la prochaine.
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let mandats: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = { soumettreDocumentPourUtilisateur: vi.fn(), listerMesVerifications: vi.fn() };
    mandats = { creerMandat: vi.fn(), signerMandat: vi.fn(), revoquerMandat: vi.fn(), listerMesMandats: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentiteController],
      providers: [
        { provide: IdentiteService, useValue: service },
        { provide: MandatsService, useValue: mandats },
      ],
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

  it('crée un mandat pour le projet donné', async () => {
    mandats.creerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
    await controller.creerMandat(user, { projectId: 'p1', purpose: 'depot_creation_entreprise' });
    expect(mandats.creerMandat).toHaveBeenCalledWith('user-1', 'p1', 'depot_creation_entreprise');
  });

  it('signe un mandat avec l’IP de la requête', async () => {
    mandats.signerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
    const req = { ip: '203.0.113.4' } as any;
    await controller.signerMandat(user, 'm1', { nomComplet: 'Jean Dupont' }, req);
    expect(mandats.signerMandat).toHaveBeenCalledWith('user-1', 'm1', 'Jean Dupont', '203.0.113.4');
  });

  it('révoque un mandat', async () => {
    mandats.revoquerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
    await controller.revoquerMandat(user, 'm1');
    expect(mandats.revoquerMandat).toHaveBeenCalledWith('user-1', 'm1');
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
