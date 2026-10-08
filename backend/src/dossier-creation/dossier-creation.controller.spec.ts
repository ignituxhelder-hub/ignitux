import { NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DossierCreationController } from './dossier-creation.controller.js';
import { DossierCreationService } from './dossier-creation.service.js';
import { genererPdfDossier } from './dossier-pdf.js';
import { fraisPourForme } from './guide.js';

describe('DossierCreationController', () => {
  let controller: DossierCreationController;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  const user = { id: 'user-1', email: 'a@b.c' };

  beforeEach(async () => {
    service = {
      obtenir: vi.fn().mockResolvedValue({ forme: null }),
      cocher: vi.fn().mockResolvedValue({ forme: null }),
      marquerDepose: vi.fn().mockResolvedValue({ forme: null }),
      rouvrir: vi.fn().mockResolvedValue({ forme: null }),
      recapitulatifPdf: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DossierCreationController],
      providers: [{ provide: DossierCreationService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(DossierCreationController);
  });

  it('expose la lecture', async () => {
    await controller.obtenir(user, 'p1');
    expect(service.obtenir).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('transmet les pièces cochées', async () => {
    await controller.cocher(user, 'p1', { checkedItems: ['capital_depose'] });
    expect(service.cocher).toHaveBeenCalledWith('user-1', 'p1', ['capital_depose']);
  });

  it('transmet le dépôt et sa référence', async () => {
    await controller.deposer(user, 'p1', { filingReference: 'REF' });
    expect(service.marquerDepose).toHaveBeenCalledWith('user-1', 'p1', 'REF');
  });

  it('transmet la réouverture', async () => {
    await controller.rouvrir(user, 'p1');
    expect(service.rouvrir).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('renvoie le PDF avec les en-têtes', async () => {
    service.recapitulatifPdf.mockResolvedValue(Buffer.from('%PDF-1.3'));
    const res = { set: vi.fn(), send: vi.fn() } as any;
    await controller.telechargerPdf(user, 'p1', res);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }),
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF-1.3'));
  });

  it('n’envoie rien si le projet est introuvable', async () => {
    service.recapitulatifPdf.mockRejectedValue(new NotFoundException('Projet introuvable.'));
    const res = { set: vi.fn(), send: vi.fn() } as any;
    await expect(controller.telechargerPdf(user, 'p1', res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.set).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('DossierCreationController GET pdf (HTTP)', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = { recapitulatifPdf: vi.fn() };
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 avec un vrai PDF et les bons en-têtes', async () => {
    service.recapitulatifPdf.mockResolvedValue(
      await genererPdfDossier({
        projetTitre: 'Projet',
        forme: null,
        statuts: null,
        pieces: [],
        frais: fraisPourForme(null),
        depot: { status: 'preparation', depositedAt: null, filingReference: null },
      }),
    );

    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/dossier-creation/pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as Buffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(service.recapitulatifPdf).toHaveBeenCalledWith('user-1', projectId);
  });

  it('404 pour un projet d’un autre utilisateur', async () => {
    service.recapitulatifPdf.mockRejectedValue(new NotFoundException('Projet introuvable.'));
    const res = await request(app.getHttpServer()).get(`/projects/${projectId}/dossier-creation/pdf`);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Projet introuvable.');
  });
});
