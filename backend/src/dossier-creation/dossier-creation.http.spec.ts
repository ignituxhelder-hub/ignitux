import { ConflictException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DossierCreationController } from './dossier-creation.controller.js';
import { DossierCreationService } from './dossier-creation.service.js';

/**
 * Validation des corps au niveau HTTP, SANS base de données : le service est
 * un mock. Le `ValidationPipe` est reproduit à l'identique depuis `main.ts`
 * (même convention que statuts.http.spec.ts).
 */
describe('DossierCreationController — validation HTTP des corps', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      obtenir: vi.fn().mockResolvedValue({ forme: 'SAS' }),
      cocher: vi.fn().mockResolvedValue({ forme: 'SAS' }),
      marquerDepose: vi.fn().mockResolvedValue({ forme: 'SAS' }),
      rouvrir: vi.fn().mockResolvedValue({ forme: 'SAS' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DossierCreationController],
      providers: [{ provide: DossierCreationService, useValue: service }],
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

  const base = `/projects/${projectId}/dossier-creation`;
  const patcher = (corps: unknown) => request(app.getHttpServer()).patch(base).send(corps as object);
  const deposer = (corps: unknown) => request(app.getHttpServer()).post(`${base}/depose`).send(corps as object);

  it('GET : 200 et transmet le propriétaire', async () => {
    const res = await request(app.getHttpServer()).get(base);
    expect(res.status).toBe(200);
    expect(service.obtenir).toHaveBeenCalledWith('user-1', projectId);
  });

  it('400 sur un projectId qui n’est pas un UUID', async () => {
    const res = await request(app.getHttpServer()).get('/projects/pas-un-uuid/dossier-creation');
    expect(res.status).toBe(400);
    expect(service.obtenir).not.toHaveBeenCalled();
  });

  describe('PATCH', () => {
    it('accepte des pièces cochables', async () => {
      const res = await patcher({ checkedItems: ['justificatif_siege', 'declaration_beneficiaires'] });
      expect(res.status).toBe(200);
      expect(service.cocher).toHaveBeenCalledWith('user-1', projectId, ['justificatif_siege', 'declaration_beneficiaires']);
    });

    it('accepte un tableau vide', async () => {
      const res = await patcher({ checkedItems: [] });
      expect(res.status).toBe(200);
      expect(service.cocher).toHaveBeenCalledWith('user-1', projectId, []);
    });

    it.each([
      ['un id inconnu', { checkedItems: ['inconnu'] }],
      ['une pièce calculée (non cochable)', { checkedItems: ['statuts'] }],
      ['des doublons', { checkedItems: ['capital_depose', 'capital_depose'] }],
      ['un champ absent', {}],
      ['autre chose qu’un tableau', { checkedItems: 'capital_depose' }],
      ['un champ en trop', { checkedItems: [], status: 'depose' }],
    ])('400 pour %s', async (_cas, corps) => {
      const res = await patcher(corps);
      expect(res.status).toBe(400);
      expect(service.cocher).not.toHaveBeenCalled();
    });
  });

  describe('POST depose', () => {
    it('200 sans corps (référence facultative)', async () => {
      const res = await deposer({});
      expect(res.status).toBe(200);
      expect(service.marquerDepose).toHaveBeenCalledWith('user-1', projectId, undefined);
    });

    it('200 avec une référence de 100 caractères', async () => {
      const res = await deposer({ filingReference: 'x'.repeat(100) });
      expect(res.status).toBe(200);
    });

    it('400 au-delà de 100 caractères', async () => {
      const res = await deposer({ filingReference: 'x'.repeat(101) });
      expect(res.status).toBe(400);
      expect(service.marquerDepose).not.toHaveBeenCalled();
    });

    it('400 pour une référence qui n’est pas une chaîne', async () => {
      const res = await deposer({ filingReference: 123 });
      expect(res.status).toBe(400);
    });

    it('409 relayé quand le dossier est déjà déposé', async () => {
      service.marquerDepose.mockRejectedValue(new ConflictException('Ce dossier est déjà marqué comme déposé.'));
      const res = await deposer({});
      expect(res.status).toBe(409);
    });
  });

  describe('POST rouvrir', () => {
    it('200', async () => {
      const res = await request(app.getHttpServer()).post(`${base}/rouvrir`);
      expect(res.status).toBe(200);
      expect(service.rouvrir).toHaveBeenCalledWith('user-1', projectId);
    });

    it('409 relayé quand le dossier n’est pas déposé', async () => {
      service.rouvrir.mockRejectedValue(new ConflictException('Ce dossier n’est pas marqué comme déposé.'));
      const res = await request(app.getHttpServer()).post(`${base}/rouvrir`);
      expect(res.status).toBe(409);
    });
  });
});
