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

  it('PUT : refuse une date qui n’est pas AAAA-MM-JJ, en français et sans nom de champ', async () => {
    const res = await put({ ...corpsValide(), registeredOn: '01/10/2026' });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(['La date d’immatriculation s’écrit AAAA-MM-JJ.']);
  });

  it.each([
    ['legalName', { legalName: '' }, 'La dénomination est obligatoire.'],
    ['legalName', { legalName: 'x'.repeat(201) }, 'La dénomination fait au plus 200 caractères.'],
    ['headOffice', { headOffice: 'x'.repeat(301) }, 'L’adresse du siège fait au plus 300 caractères.'],
    ['siren', { siren: 443061841 }, 'Le SIREN s’écrit en chiffres, sous forme de texte.'],
    ['siret', { siret: 'x'.repeat(31) }, 'Le SIRET est trop long.'],
    ['vatNumber', { vatNumber: 12 }, 'Le numéro de TVA s’écrit sous forme de texte.'],
  ])('PUT : message français pour %s', async (champ, modif, message) => {
    const res = await put({ ...corpsValide(), ...modif });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(message);
    for (const m of res.body.message as string[]) expect(m).not.toContain(champ);
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
    expect((await request(serveur).post(url('/capital')).send({ montantCents: 100000, date: '2026-10-01' })).status).toBe(201);
    expect(service.obtenir).toHaveBeenCalledWith('user-1', projectId);
    expect(service.supprimer).toHaveBeenCalledWith('user-1', projectId);
    expect(service.obtenirCapital).toHaveBeenCalledWith('user-1', projectId);
    expect(service.enregistrerCapital).toHaveBeenCalledWith('user-1', projectId, {
      montantCents: 100000,
      date: '2026-10-01',
    });
  });

  describe('POST capital : ce que la personne a vu', () => {
    const post = (corps: unknown) => request(app.getHttpServer()).post(url('/capital')).send(corps as object);

    it.each([
      ['sans corps', {}],
      ['montant absent', { date: '2026-10-01' }],
      ['date absente', { montantCents: 100000 }],
      ['montant décimal', { montantCents: 1000.5, date: '2026-10-01' }],
      ['montant en texte', { montantCents: '100000', date: '2026-10-01' }],
      ['montant nul', { montantCents: 0, date: '2026-10-01' }],
      ['date mal écrite', { montantCents: 100000, date: '01/10/2026' }],
      ['champ en trop', { montantCents: 100000, date: '2026-10-01', comptes: ['512'] }],
    ])('400 %s, sans rien enregistrer', async (_cas, corps) => {
      expect((await post(corps)).status).toBe(400);
      expect(service.enregistrerCapital).not.toHaveBeenCalled();
    });

    it('messages en français, sans nom de champ', async () => {
      const res = await post({ montantCents: 1.5, date: 'hier' });
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'Le montant confirmé est un nombre entier de centimes.',
          'La date de l’écriture s’écrit AAAA-MM-JJ.',
        ]),
      );
      for (const m of res.body.message as string[]) {
        expect(m).not.toContain('montantCents');
        expect(m).not.toMatch(/^date\b/);
      }
    });
  });
});
