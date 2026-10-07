import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StatutsController } from './statuts.controller.js';
import { StatutsService } from './statuts.service.js';

/**
 * Validation des corps au niveau HTTP, SANS base de données : le service est
 * un mock. Le `ValidationPipe` est reproduit à l'identique depuis `main.ts`
 * (même convention que test/e2e-app.ts) — sans lui, aucun DTO ne serait
 * validé et ces tests passeraient pour une protection qui n'existe pas.
 *
 * Ce qui est visé : les associés imbriqués, que seul `@ValidateNested` +
 * `@Type` font réellement valider. Un test unitaire du DTO ne prouve pas que
 * la transformation a lieu sur une vraie requête.
 */
describe('StatutsController — validation HTTP des corps', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const corpsValide = () => ({
    capitalCents: 100000,
    headOffice: '1 rue de la Paix, 75002 Paris',
    durationYears: 99,
    associates: [{ fullName: 'Alice', shareBasisPoints: 10000 }],
  });

  beforeEach(async () => {
    service = {
      genererPourProjet: vi.fn().mockResolvedValue({ id: 'b1', associates: [] }),
      regenererPourProjet: vi.fn().mockResolvedValue({ id: 'b1', associates: [] }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [StatutsController],
      providers: [{ provide: StatutsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { id: 'user-1', email: 'a@b.c' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const poster = (corps: unknown, chemin = '') =>
    request(app.getHttpServer()).post(`/projects/${projectId}/statuts${chemin}`).send(corps as object);

  it('accepte un corps valide et le transmet typé au service', async () => {
    const res = await poster(corpsValide());

    expect(res.status).toBe(201);
    expect(service.genererPourProjet).toHaveBeenCalledWith('user-1', projectId, corpsValide());
  });

  it('refuse une part d’associé envoyée en chaîne', async () => {
    const corps = corpsValide();
    (corps.associates[0] as Record<string, unknown>).shareBasisPoints = '10000';

    const res = await poster(corps);

    expect(res.status).toBe(400);
    expect(service.genererPourProjet).not.toHaveBeenCalled();
  });

  it('refuse un champ en trop dans un associé', async () => {
    const corps = corpsValide();
    (corps.associates[0] as Record<string, unknown>).role = 'gérant';

    const res = await poster(corps);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('role');
    expect(service.genererPourProjet).not.toHaveBeenCalled();
  });

  it('refuse une liste d’associés vide', async () => {
    const res = await poster({ ...corpsValide(), associates: [] });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('Il faut au moins un associé.');
    expect(service.genererPourProjet).not.toHaveBeenCalled();
  });

  it('refuse un capital au-delà de ce que la colonne Int peut stocker', async () => {
    const res = await poster({ ...corpsValide(), capitalCents: 2_147_483_648 });

    expect(res.status).toBe(400);
    expect(service.genererPourProjet).not.toHaveBeenCalled();
  });

  it('applique la même validation à la régénération', async () => {
    const corps = corpsValide();
    (corps.associates[0] as Record<string, unknown>).shareBasisPoints = '10000';

    expect((await poster(corps, '/regenerer')).status).toBe(400);
    expect((await poster(corpsValide(), '/regenerer')).status).toBe(201);
    expect(service.regenererPourProjet).toHaveBeenCalledTimes(1);
  });
});

describe('StatutsController — limite de débit des routes qui appellent Claude', () => {
  // Même limite que les autres routes qui coûtent un appel Claude
  // (POST /projects/:id/analyze) : 5 par minute.
  const limite = (methode: keyof StatutsController) =>
    Reflect.getMetadata('THROTTLER:LIMITdefault', StatutsController.prototype[methode]);
  const duree = (methode: keyof StatutsController) =>
    Reflect.getMetadata('THROTTLER:TTLdefault', StatutsController.prototype[methode]);

  it.each(['generer', 'regenerer'] as const)('%s : 5 appels par minute', (methode) => {
    expect(limite(methode)).toBe(5);
    expect(duree(methode)).toBe(60_000);
  });
});
