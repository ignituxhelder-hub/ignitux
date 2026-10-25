import { UnauthorizedException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UnexpectedErrorFilter } from '../observability/error.filter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoleGuard } from '../roles/role.guard.js';
import { RolesService } from '../roles/roles.service.js';
import { BAREME, presenterBareme } from './bareme.js';
import { AdminCreditsController, CreditsController } from './credits.controller.js';
import { CreditsService } from './credits.service.js';
import { FausseBaseCredits } from './credits.testing.js';

/**
 * LES ROUTES DES CRÉDITS, EN HTTP, SANS BASE.
 *
 * Les vrais contrôleurs, le vrai `CreditsService`, le vrai `RoleGuard`, le
 * `ValidationPipe` et le filtre d'erreurs de `main.ts` — sur la fausse base
 * en mémoire de `credits.testing.ts`. Seule l'authentification est simulée :
 * l'en-tête `x-test-user` tient lieu de jeton (absent = 401).
 */
const PROPRIO = '11111111-1111-4111-8111-111111111111';
const MEMBRE = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const PROJET = '55555555-5555-4555-8555-555555555555';

describe('Crédits — routes HTTP', () => {
  let app: INestApplication;
  let db: FausseBaseCredits;

  beforeEach(async () => {
    db = new FausseBaseCredits({
      comptes: [
        { id: PROPRIO, email: 'proprio@exemple.fr', display_name: 'Camille' },
        { id: MEMBRE, email: 'membre@exemple.fr', display_name: 'Sam' },
        { id: ADMIN, email: 'admin@ignitux.com' },
      ],
      projets: [{ id: PROJET, title: 'Boulangerie', owner_id: PROPRIO, membres: [MEMBRE] }],
      lignes: [
        {
          owner_id: PROPRIO,
          kind: 'bienvenue',
          credits: 30,
          motif: 'Cadeau de bienvenue',
          created_at: new Date('2026-10-25T09:00:00.000Z'),
        },
        {
          owner_id: PROPRIO,
          actor_id: MEMBRE,
          kind: 'debit',
          credits: -BAREME.construire.credits,
          generator: 'construire',
          project_id: PROJET,
          ai_usage_event_id: 'appel-1',
          created_at: new Date('2026-10-25T10:00:00.000Z'),
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [CreditsController, AdminCreditsController],
      providers: [
        CreditsService,
        RoleGuard,
        { provide: PrismaService, useValue: db.client() },
        {
          provide: RolesService,
          useValue: { holdsRole: async (id: string, role: string) => id === ADMIN && role === 'administrateur' },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, any> } }) => {
          const req = ctx.switchToHttp().getRequest();
          const id = req.headers['x-test-user'];
          if (!id) throw new UnauthorizedException();
          req.user = { id, email: `${String(id).slice(0, 4)}@exemple.fr` };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    // Reproduits à l'identique depuis main.ts : sans eux, aucun DTO ne serait
    // validé et les refus n'auraient pas la forme que l'interface reçoit.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new UnexpectedErrorFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /credits/bareme', () => {
    it('est public : le barème du serveur, sans connexion', async () => {
      const res = await http().get('/credits/bareme').expect(200);
      expect(res.body).toEqual(presenterBareme());
      expect(res.body.actions.find((a: { generateur: string }) => a.generateur === 'analyser')).toEqual({
        generateur: 'analyser',
        libelle: BAREME.analyser.libelle,
        credits: BAREME.analyser.credits,
        par: 'action',
      });
    });
  });

  describe('GET /credits', () => {
    it('refuse sans connexion (401)', async () => {
      await http().get('/credits').expect(401);
    });

    it('rend le solde, le barème et l’historique de la personne connectée', async () => {
      const res = await http().get('/credits').set('x-test-user', PROPRIO).expect(200);

      expect(res.body).toEqual({
        solde: 30 - BAREME.construire.credits,
        bareme: presenterBareme(),
        historique: [
          {
            id: expect.any(String),
            date: '2026-10-25T10:00:00.000Z',
            kind: 'debit',
            credits: -BAREME.construire.credits,
            generateur: 'construire',
            libelle: BAREME.construire.libelle,
            projet: { id: PROJET, titre: 'Boulangerie' },
            acteur: 'Sam',
            motif: null,
          },
          {
            id: expect.any(String),
            date: '2026-10-25T09:00:00.000Z',
            kind: 'bienvenue',
            credits: 30,
            generateur: null,
            libelle: null,
            projet: null,
            acteur: null,
            motif: 'Cadeau de bienvenue',
          },
        ],
      });
    });

    it('verse la bienvenue au premier passage d’un compte d’avant les crédits', async () => {
      const res = await http().get('/credits').set('x-test-user', MEMBRE).expect(200);
      expect(res.body.solde).toBe(30);
      await http().get('/credits').set('x-test-user', MEMBRE).expect(200);
      expect(db.de(MEMBRE, 'bienvenue')).toHaveLength(1);
    });
  });

  describe('administration', () => {
    it('GET /admin/credits : refusé sans le rôle administrateur (403), sans connexion (401)', async () => {
      await http().get('/admin/credits').expect(401);
      const res = await http().get('/admin/credits').set('x-test-user', PROPRIO).expect(403);
      expect(res.body.message).toMatch(/administrat/i);
    });

    it('GET /admin/credits : les comptes, leur adresse et leur solde, paginés', async () => {
      const res = await http().get('/admin/credits?page=1&parPage=2').set('x-test-user', ADMIN).expect(200);
      expect(res.body).toEqual({
        page: 1,
        parPage: 2,
        total: 3,
        comptes: [
          { id: PROPRIO, email: 'proprio@exemple.fr', creeLe: null, solde: 30 - BAREME.construire.credits, bienvenueVersee: true },
          { id: MEMBRE, email: 'membre@exemple.fr', creeLe: null, solde: 0, bienvenueVersee: false },
        ],
      });
    });

    it('POST /admin/credits/:userId : réservé à l’administrateur', async () => {
      await http().post(`/admin/credits/${PROPRIO}`).set('x-test-user', MEMBRE).send({ credits: 10, motif: 'test' }).expect(403);
      expect(db.de(PROPRIO, 'ajustement_admin')).toHaveLength(0);
    });

    it('POST /admin/credits/:userId : ajoute avec le motif, et rend le nouveau solde', async () => {
      const res = await http()
        .post(`/admin/credits/${PROPRIO}`)
        .set('x-test-user', ADMIN)
        .send({ credits: 50, motif: '  geste commercial ' })
        .expect(201);

      expect(res.body).toEqual({ id: expect.any(String), solde: 80 - BAREME.construire.credits });
      expect(db.de(PROPRIO, 'ajustement_admin')[0]).toMatchObject({
        credits: 50,
        actor_id: ADMIN,
        motif: 'geste commercial',
      });
    });

    it('POST /admin/credits/:userId : refuse de passer sous zéro (409), sans rien écrire', async () => {
      const res = await http()
        .post(`/admin/credits/${PROPRIO}`)
        .set('x-test-user', ADMIN)
        .send({ credits: -1000, motif: 'test' })
        .expect(409);
      expect(res.body.message).toContain('rendrait le solde négatif');
      expect(db.de(PROPRIO, 'ajustement_admin')).toHaveLength(0);
    });

    it.each([
      ['credits à zéro', { credits: 0, motif: 'test' }],
      ['credits au-delà de 10 000', { credits: 10_001, motif: 'test' }],
      ['credits en deçà de -10 000', { credits: -10_001, motif: 'test' }],
      ['credits décimal', { credits: 2.5, motif: 'test' }],
      ['credits en texte', { credits: '10', motif: 'test' }],
      ['motif absent', { credits: 10 }],
      ['motif trop court une fois les espaces retirés', { credits: 10, motif: '  a  ' }],
      ['motif trop long', { credits: 10, motif: 'x'.repeat(201) }],
      ['champ en trop', { credits: 10, motif: 'test', kind: 'recharge' }],
    ])('POST /admin/credits/:userId : refuse %s (400)', async (_cas, corps) => {
      await http().post(`/admin/credits/${PROPRIO}`).set('x-test-user', ADMIN).send(corps).expect(400);
      expect(db.de(PROPRIO, 'ajustement_admin')).toHaveLength(0);
    });

    it('POST /admin/credits/:userId : refuse un identifiant qui n’est pas un UUID (400), un compte inconnu (404)', async () => {
      await http().post('/admin/credits/pas-un-uuid').set('x-test-user', ADMIN).send({ credits: 5, motif: 'test' }).expect(400);
      await http()
        .post('/admin/credits/99999999-9999-4999-8999-999999999999')
        .set('x-test-user', ADMIN)
        .send({ credits: 5, motif: 'test' })
        .expect(404);
    });
  });
});
