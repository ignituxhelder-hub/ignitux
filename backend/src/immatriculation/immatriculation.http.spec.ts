import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ImmatriculationController } from './immatriculation.controller.js';
import { ImmatriculationService } from './immatriculation.service.js';

/**
 * Validation des corps au niveau HTTP, SANS base de données : le service est
 * un mock. Le `ValidationPipe` est reproduit à l'identique depuis `main.ts`
 * (même convention que statuts.http.spec.ts).
 */
describe('ImmatriculationController — validation HTTP', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const corpsValide = () => ({
    siren: '443 061 841',
    siret: '44306184100013',
    vatNumber: 'FR64443061841',
    legalName: 'Ma Société',
    headOffice: '1 rue de la Paix, 75002 Paris',
    registeredOn: '2026-10-01',
  });

  beforeEach(async () => {
    const etat = { registration: null, suggestion: null };
    service = {
      obtenir: vi.fn().mockResolvedValue(etat),
      enregistrer: vi.fn().mockResolvedValue(etat),
      supprimer: vi.fn().mockResolvedValue(etat),
      obtenirCapital: vi.fn().mockResolvedValue({ proposition: null, dejaEnregistree: false, raison: 'x' }),
      enregistrerCapital: vi.fn().mockResolvedValue({ entryId: 'e1' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ImmatriculationController],
      providers: [{ provide: ImmatriculationService, useValue: service }],
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

  const url = (chemin = '') => `/projects/${projectId}/immatriculation${chemin}`;
  const put = (corps: unknown) => request(app.getHttpServer()).put(url()).send(corps as object);

  it('PUT : accepte un corps valide et le transmet au service', async () => {
    const res = await put(corpsValide());
    expect(res.status).toBe(200);
    expect(service.enregistrer).toHaveBeenCalledWith('user-1', projectId, corpsValide());
  });

  it('PUT : SIRET et TVA facultatifs', async () => {
    const { siret: _s, vatNumber: _v, ...corps } = corpsValide();
    expect((await put(corps)).status).toBe(200);
  });

  it('PUT : refuse un champ en trop (forbidNonWhitelisted)', async () => {
    const res = await put({ ...corpsValide(), capital_entry_id: 'x' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('capital_entry_id');
    expect(service.enregistrer).not.toHaveBeenCalled();
  });

  it('PUT : refuse un SIREN envoyé en nombre', async () => {
    expect((await put({ ...corpsValide(), siren: 443061841 })).status).toBe(400);
    expect(service.enregistrer).not.toHaveBeenCalled();
  });

  it.each(['legalName', 'headOffice', 'registeredOn', 'siren'])('PUT : refuse sans %s', async (champ) => {
    const corps: Record<string, unknown> = corpsValide();
    delete corps[champ];
    expect((await put(corps)).status).toBe(400);
    expect(service.enregistrer).not.toHaveBeenCalled();
  });

  it('PUT : refuse une date qui n’est pas AAAA-MM-JJ', async () => {
    expect((await put({ ...corpsValide(), registeredOn: '01/10/2026' })).status).toBe(400);
  });

  it('PUT : refuse une dénomination de plus de 200 caractères', async () => {
    expect((await put({ ...corpsValide(), legalName: 'x'.repeat(201) })).status).toBe(400);
  });

  it('refuse un projectId qui n’est pas un UUID', async () => {
    expect((await request(app.getHttpServer()).get('/projects/pas-un-uuid/immatriculation')).status).toBe(400);
    expect(service.obtenir).not.toHaveBeenCalled();
  });

  it('GET, DELETE, GET capital, POST capital sont routés vers le service', async () => {
    const serveur = app.getHttpServer();
    expect((await request(serveur).get(url())).status).toBe(200);
    expect((await request(serveur).delete(url())).status).toBe(200);
    expect((await request(serveur).get(url('/capital'))).status).toBe(200);
    expect((await request(serveur).post(url('/capital'))).status).toBe(201);
    expect(service.obtenir).toHaveBeenCalledWith('user-1', projectId);
    expect(service.supprimer).toHaveBeenCalledWith('user-1', projectId);
    expect(service.obtenirCapital).toHaveBeenCalledWith('user-1', projectId);
    expect(service.enregistrerCapital).toHaveBeenCalledWith('user-1', projectId);
  });
});
