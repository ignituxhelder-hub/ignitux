import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FinancedProjectsController, InvestorsController } from './investors.controller.js';
import { InvestorsService } from './investors.service.js';

// getEnv() valide process.env avec Zod et appelle process.exit(1) si la
// configuration est incomplète : inutilisable tel quel dans un test.
const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
vi.mock('../config/env.js', () => ({ getEnv: () => env.current }));

/**
 * Preuve que BetaV1Guard est réellement posé sur ces deux contrôleurs — pas
 * seulement testé en isolation (voir config/beta-v1.guard.spec.ts). Le
 * service est un double minimal : ces routes ne doivent jamais l'atteindre
 * pendant la bêta.
 */
describe('Portefeuille investisseur & projets financés — BetaV1Guard', () => {
  let app: INestApplication;
  let investors: { myInvestor: ReturnType<typeof vi.fn>; portfolio: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    env.current = {};
    investors = { myInvestor: vi.fn(), portfolio: vi.fn() };
  });

  afterEach(async () => {
    await app?.close();
  });

  async function demarrer() {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorsController, FinancedProjectsController],
      providers: [{ provide: InvestorsService, useValue: investors }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: 'u1', email: 'a@b.com' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  }

  it('refuse 403 par défaut sur le portefeuille, avant même d’atteindre le service', async () => {
    await demarrer();

    await request(app.getHttpServer()).get('/investisseurs/moi/portefeuille').expect(403);
    expect(investors.myInvestor).not.toHaveBeenCalled();
  });

  it("laisse passer quand IGNITUX_BETA_V1='false'", async () => {
    env.current = { IGNITUX_BETA_V1: 'false' };
    investors.myInvestor.mockResolvedValue({ id: 'i1' });
    investors.portfolio.mockResolvedValue({ global: {}, parProjet: [] });
    await demarrer();

    await request(app.getHttpServer()).get('/investisseurs/moi/portefeuille').expect(200);
  });
});
