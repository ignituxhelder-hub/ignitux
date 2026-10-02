import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  type ExecutionContext,
  type INestApplication,
  NotFoundException,
  StreamableFile,
  ValidationPipe,
} from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../roles/role.guard.js';
import { fileFilter, IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';
import { MandatsService } from './mandats.service.js';
import { TEXTE_MANDAT } from './mandate-text.js';

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

  it('transmet la décision de revue avec l’administrateur qui tranche', async () => {
    service.revoirVerification = vi.fn().mockResolvedValue({ id: 'v1' });
    const admin = { id: 'admin-1', email: 'admin@ignitux.test' };
    await controller.revoir(admin, 'v1', { decision: 'rejetee', motif: 'photo illisible' });
    expect(service.revoirVerification).toHaveBeenCalledWith('admin-1', 'v1', 'rejetee', 'photo illisible');
  });

  it('sert une face de document en binaire, avec son type détecté', async () => {
    const octets = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    service.lireDocument = vi.fn().mockResolvedValue({ contenu: octets, type: 'image/png' });

    const fichier = await controller.document(user, 'v1', 'back');

    expect(service.lireDocument).toHaveBeenCalledWith('user-1', 'v1', 'back');
    expect(fichier).toBeInstanceOf(StreamableFile);
    expect(fichier.getHeaders().type).toBe('image/png');
  });

  it('interdit toute mise en cache de la réponse document', () => {
    // @Header pose ses métadonnées sur la méthode : on vérifie directement
    // ce que Nest lira, plutôt que de monter un serveur HTTP complet.
    const entetes = Reflect.getMetadata(HEADERS_METADATA, IdentiteController.prototype.document);
    expect(entetes).toEqual(expect.arrayContaining([{ name: 'Cache-Control', value: 'no-store' }]));
  });

  it('expose le texte du mandat en vigueur', () => {
    expect(controller.texteMandat()).toEqual({ texte: TEXTE_MANDAT });
  });

  it('crée un mandat pour le projet donné', async () => {
    mandats.creerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
    await controller.creerMandat(user, { projectId: 'p1', purpose: 'depot_creation_entreprise' });
    expect(mandats.creerMandat).toHaveBeenCalledWith('user-1', 'p1', 'depot_creation_entreprise');
  });

  it('signe un mandat avec l’IP de la requête', async () => {
    mandats.signerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
    const req = { ip: '203.0.113.4' } as any;
    await controller.signerMandat(user, 'm1', { nomComplet: 'Jean Dupont', accepte: true }, req);
    expect(mandats.signerMandat).toHaveBeenCalledWith('user-1', 'm1', 'Jean Dupont', '203.0.113.4');
  });

  it('révoque un mandat', async () => {
    mandats.revoquerMandat = vi.fn().mockResolvedValue({ id: 'm1' });
    await controller.revoquerMandat(user, 'm1');
    expect(mandats.revoquerMandat).toHaveBeenCalledWith('user-1', 'm1');
  });
});

/**
 * Au niveau HTTP, avec la même ValidationPipe que main.ts : vérifie ce que
 * les tests d'appel direct ci-dessus ne peuvent pas voir — les en-têtes et
 * le corps binaire réellement envoyés, la validation de `:face`, et le
 * refus d'une signature sans `accepte: true`.
 */
describe('IdentiteController (HTTP)', () => {
  let app: INestApplication;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let mandats: Record<string, ReturnType<typeof vi.fn>>;
  const UUID = '11111111-1111-4111-8111-111111111111';
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

  beforeEach(async () => {
    service = { lireDocument: vi.fn() };
    mandats = { signerMandat: vi.fn().mockResolvedValue({ id: 'm1' }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentiteController],
      providers: [
        { provide: IdentiteService, useValue: service },
        { provide: MandatsService, useValue: mandats },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'user-1', email: 'a@b.c' };
          return true;
        },
      })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sert les octets bruts avec Content-Type détecté et Cache-Control: no-store', async () => {
    service.lireDocument.mockResolvedValue({ contenu: PNG, type: 'image/png' });

    const res = await request(app.getHttpServer())
      .get(`/identite/verifications/${UUID}/document/front`)
      .buffer(true)
      .parse((r, cb) => {
        const morceaux: Buffer[] = [];
        r.on('data', (m: Buffer) => morceaux.push(m));
        r.on('end', () => cb(null, Buffer.concat(morceaux)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    expect(service.lireDocument).toHaveBeenCalledWith('user-1', UUID, 'front');
  });

  it('refuse une face inconnue (400) sans interroger le service', async () => {
    const res = await request(app.getHttpServer()).get(`/identite/verifications/${UUID}/document/selfie`);
    expect(res.status).toBe(400);
    expect(service.lireDocument).not.toHaveBeenCalled();
  });

  it('propage le 404 du service (verso absent, ou tiers non autorisé)', async () => {
    service.lireDocument.mockRejectedValue(new NotFoundException("Cette vérification n'a pas de verso."));
    const res = await request(app.getHttpServer()).get(`/identite/verifications/${UUID}/document/back`);
    expect(res.status).toBe(404);
  });

  it('sert le texte du mandat', async () => {
    const res = await request(app.getHttpServer()).get('/identite/mandats/texte');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ texte: TEXTE_MANDAT });
  });

  it('refuse une signature sans accepte: true', async () => {
    const res = await request(app.getHttpServer())
      .post(`/identite/mandats/${UUID}/signer`)
      .send({ nomComplet: 'Jean Dupont' });
    expect(res.status).toBe(400);
    expect(mandats.signerMandat).not.toHaveBeenCalled();
  });

  it('accepte une signature avec accepte: true', async () => {
    const res = await request(app.getHttpServer())
      .post(`/identite/mandats/${UUID}/signer`)
      .send({ nomComplet: 'Jean Dupont', accepte: true });
    expect(res.status).toBe(201);
    expect(mandats.signerMandat).toHaveBeenCalledWith('user-1', UUID, 'Jean Dupont', expect.any(String));
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
