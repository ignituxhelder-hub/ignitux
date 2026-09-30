import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';

// getEnv() valide process.env avec Zod et appelle process.exit(1) si la
// configuration est incomplète : inutilisable tel quel dans un test.
const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
vi.mock('../config/env.js', () => ({ getEnv: () => env.current }));

describe('MarketplaceController', () => {
  let controller: MarketplaceController;
  let marketplaceService: {
    listProfiles: ReturnType<typeof vi.fn>;
    getOwnProfile: ReturnType<typeof vi.fn>;
    upsertProfile: ReturnType<typeof vi.fn>;
    removeOwnProfile: ReturnType<typeof vi.fn>;
    contactProfile: ReturnType<typeof vi.fn>;
    listReceivedContacts: ReturnType<typeof vi.fn>;
  };
  const currentUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(async () => {
    env.current = {};
    marketplaceService = {
      listProfiles: vi.fn(),
      getOwnProfile: vi.fn(),
      upsertProfile: vi.fn(),
      removeOwnProfile: vi.fn(),
      contactProfile: vi.fn(),
      listReceivedContacts: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [{ provide: MarketplaceService, useValue: marketplaceService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MarketplaceController>(MarketplaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listProfiles délègue au service avec le rôle donné', async () => {
    marketplaceService.listProfiles.mockResolvedValue([]);

    await controller.listProfiles('mentor');

    expect(marketplaceService.listProfiles).toHaveBeenCalledWith('mentor');
  });

  it('getOwnProfile délègue au service', async () => {
    marketplaceService.getOwnProfile.mockResolvedValue(null);

    await controller.getOwnProfile(currentUser);

    expect(marketplaceService.getOwnProfile).toHaveBeenCalledWith('u1');
  });

  it('upsertProfile délègue au service avec les champs du dto', async () => {
    marketplaceService.upsertProfile.mockResolvedValue({ id: 'm1' });

    await controller.upsertProfile(currentUser, {
      role: 'mentor',
      headline: 'Mentor growth',
      bio: 'Bio',
      expertise: ['growth'],
    });

    expect(marketplaceService.upsertProfile).toHaveBeenCalledWith('u1', 'mentor', 'Mentor growth', 'Bio', ['growth']);
  });

  it('removeOwnProfile délègue au service', async () => {
    marketplaceService.removeOwnProfile.mockResolvedValue(undefined);

    await controller.removeOwnProfile(currentUser);

    expect(marketplaceService.removeOwnProfile).toHaveBeenCalledWith('u1');
  });

  it('contactProfile délègue au service', async () => {
    marketplaceService.contactProfile.mockResolvedValue({ id: 'c1' });

    await controller.contactProfile(currentUser, 'm1', { message: 'Bonjour' });

    expect(marketplaceService.contactProfile).toHaveBeenCalledWith('u1', 'm1', 'Bonjour');
  });

  it('listReceivedContacts délègue au service', async () => {
    marketplaceService.listReceivedContacts.mockResolvedValue([]);

    await controller.listReceivedContacts(currentUser);

    expect(marketplaceService.listReceivedContacts).toHaveBeenCalledWith('u1');
  });

  describe('BetaV1Guard réellement posé sur la route (pas seulement appelé en direct)', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    it('refuse 403 par défaut, avant même d’atteindre le service', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [MarketplaceController],
        providers: [{ provide: MarketplaceService, useValue: marketplaceService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = module.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/marketplace/profiles').expect(403);
      expect(marketplaceService.listProfiles).not.toHaveBeenCalled();
    });

    it("laisse passer quand IGNITUX_BETA_V1='false'", async () => {
      env.current = { IGNITUX_BETA_V1: 'false' };
      marketplaceService.listProfiles.mockResolvedValue([]);
      const module: TestingModule = await Test.createTestingModule({
        controllers: [MarketplaceController],
        providers: [{ provide: MarketplaceService, useValue: marketplaceService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = module.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/marketplace/profiles').expect(200);
    });
  });
});
