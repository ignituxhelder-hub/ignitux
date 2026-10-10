import { NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inflateSync } from 'node:zlib';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StatutsController } from './statuts.controller.js';
import { StatutsService } from './statuts.service.js';

/**
 * Texte (hex WinAnsi) des flux décompressés du PDF. Lève si aucun flux ne se
 * décompresse : sinon un `not.toContain` passerait à vide.
 */
function flux(b: Buffer): string {
  let out = '';
  let decompresses = 0;
  for (const m of b.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      out += [...inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1').matchAll(/<([0-9a-f]+)>/g)].map((x) => x[1]).join('');
      decompresses++;
    } catch {
      // flux non Flate : ignoré
    }
  }
  if (decompresses === 0) {
    throw new Error('Aucun flux du PDF n’a pu être décompressé : le test ne vérifierait rien.');
  }
  return out;
}

describe('StatutsController', () => {
  let controller: StatutsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const user = { id: 'user-1', email: 'a@b.c' };

  beforeEach(async () => {
    service = { genererPourProjet: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [StatutsController],
      providers: [{ provide: StatutsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(StatutsController);
  });

  it('transmet la génération au service', async () => {
    const dto = { capitalCents: 100000, headOffice: 'Paris', durationYears: 99, associates: [{ fullName: 'A', shareBasisPoints: 10000 }] };
    service.genererPourProjet.mockResolvedValue({ id: 'b1' });

    await controller.generer(user, 'p1', dto);

    expect(service.genererPourProjet).toHaveBeenCalledWith('user-1', 'p1', dto);
  });

  it('transmet l’édition du texte', async () => {
    service.modifierTexte = vi.fn().mockResolvedValue({ id: 'b1' });
    await controller.modifier(user, 'p1', { content: 'nouveau texte' });
    expect(service.modifierTexte).toHaveBeenCalledWith('user-1', 'p1', 'nouveau texte');
  });

  it('transmet la régénération', async () => {
    const dto = { capitalCents: 100000, headOffice: 'Paris', durationYears: 99, associates: [{ fullName: 'A', shareBasisPoints: 10000 }] };
    service.regenererPourProjet = vi.fn().mockResolvedValue({ id: 'b1' });
    await controller.regenerer(user, 'p1', dto);
    expect(service.regenererPourProjet).toHaveBeenCalledWith('user-1', 'p1', dto);
  });

  it('transmet la rétention', async () => {
    service.retenirPourProjet = vi.fn().mockResolvedValue({ id: 'b1' });
    await controller.retenir(user, 'p1');
    expect(service.retenirPourProjet).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('transmet le déverrouillage', async () => {
    service.deverrouillerPourProjet = vi.fn().mockResolvedValue({ id: 'b1', status: 'brouillon' });
    await controller.deverrouiller(user, 'p1');
    expect(service.deverrouillerPourProjet).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('expose la lecture pour le projet', async () => {
    service.obtenirPourProjet = vi.fn().mockResolvedValue(null);
    await controller.obtenir(user, 'p1');
    expect(service.obtenirPourProjet).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('renvoie le PDF des statuts retenus ou en brouillon', async () => {
    service.obtenirPourProjet = vi.fn().mockResolvedValue({ id: 'b1', content: 'Article 1...' });
    const res = { set: vi.fn(), send: vi.fn() } as any;

    await controller.telechargerPdf(user, 'p1', res);

    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
    expect(res.send).toHaveBeenCalled();
  });

  it('404 si aucun statut n’existe pour le projet', async () => {
    service.obtenirPourProjet = vi.fn().mockResolvedValue(null);
    const res = { set: vi.fn(), send: vi.fn() } as any;

    await expect(controller.telechargerPdf(user, 'p1', res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.set).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('StatutsController GET pdf (HTTP)', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = { obtenirPourProjet: vi.fn() };
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 avec un vrai PDF et les bons en-têtes', async () => {
    service.obtenirPourProjet.mockResolvedValue({ id: 'b1', content: 'Article 1 — Forme\n« La société »' });

    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/statuts/pdf`)
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
    expect(service.obtenirPourProjet).toHaveBeenCalledWith('user-1', projectId);
  });

  describe('marqueur de brouillon', () => {
    const telecharger = async (status: string) => {
      service.obtenirPourProjet.mockResolvedValue({ id: 'b1', status, content: 'Corps' });
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/statuts/pdf`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      return flux(res.body as Buffer);
    };
    const MARQUEUR_HEX = '42726f75696c6c6f6e20' + '9720e0';

    it('un brouillon porte le marqueur', async () => {
      expect(await telecharger('brouillon')).toContain(MARQUEUR_HEX);
    });

    it('un statut inconnu compte comme brouillon', async () => {
      expect(await telecharger('autre')).toContain(MARQUEUR_HEX);
    });

    it('une version retenue ne porte pas le marqueur', async () => {
      expect(await telecharger('retenue')).not.toContain('42726f75696c6c6f6e');
    });

    it('une version retenue porte l’avertissement juridique en pied de page', async () => {
      expect(await telecharger('retenue')).toContain(Buffer.from('avocat', 'latin1').toString('hex'));
    });
  });

  it('404 quand le service renvoie null', async () => {
    service.obtenirPourProjet.mockResolvedValue(null);
    const res = await request(app.getHttpServer()).get(`/projects/${projectId}/statuts/pdf`);

    expect(res.status).toBe(404);
    expect(service.obtenirPourProjet).toHaveBeenCalledWith('user-1', projectId);
    expect(res.body.message).toBe('Statuts introuvables pour ce projet.');
  });
});
