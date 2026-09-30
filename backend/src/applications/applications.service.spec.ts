import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OffresService } from '../offres/offres.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApplicationsService } from './applications.service.js';

// getEnv() valide process.env avec Zod et appelle process.exit(1) si la
// configuration est incomplète : inutilisable tel quel dans un test.
const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
vi.mock('../config/env.js', () => ({ getEnv: () => env.current }));

type Mock = ReturnType<typeof vi.fn>;

describe('ApplicationsService — le bureau', () => {
  let service: ApplicationsService;
  let prisma: {
    user_roles: { findMany: Mock };
    projects: { findMany: Mock };
    crm_contacts: { count: Mock };
    billing_documents: { count: Mock };
    ledger_entries: { count: Mock };
    bank_accounts: { count: Mock };
    investors: { findFirst: Mock };
    participations: { count: Mock };
    user_applications: { findMany: Mock; upsert: Mock };
  };

  beforeEach(() => {
    env.current = {};
    prisma = {
      user_roles: { findMany: vi.fn().mockResolvedValue([{ role: 'entrepreneur' }]) },
      projects: { findMany: vi.fn().mockResolvedValue([]) },
      crm_contacts: { count: vi.fn().mockResolvedValue(0) },
      billing_documents: { count: vi.fn().mockResolvedValue(0) },
      ledger_entries: { count: vi.fn().mockResolvedValue(0) },
      bank_accounts: { count: vi.fn().mockResolvedValue(0) },
      investors: { findFirst: vi.fn().mockResolvedValue(null) },
      participations: { count: vi.fn().mockResolvedValue(0) },
      user_applications: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const offres = { offreDe: vi.fn().mockResolvedValue('decouverte') };
    service = new ApplicationsService(
      prisma as unknown as PrismaService,
      offres as unknown as OffresService,
    );
  });

  const ids = (liste: Array<{ id: string }>) => liste.map((app) => app.id);

  it('lit les choix enregistrés et les applique au bureau', async () => {
    // 'stocks', pas 'portefeuille' : ce test porte sur la lecture générique
    // des choix, pas sur le périmètre de la bêta V1 (voir describe dédié
    // plus bas) — 'portefeuille' y est masqué par défaut.
    prisma.user_applications.findMany.mockResolvedValue([
      { app_id: 'stocks', choix: 'ajoutee' },
      { app_id: 'parcours', choix: 'retiree' },
    ]);

    const bureau = await service.lanceurDe('u1');

    expect(ids(bureau.applications)).toContain('stocks');
    expect(ids(bureau.applications)).not.toContain('parcours');
    expect(ids(bureau.boutique)).toContain('parcours');
  });

  it('ignore un choix sur une application inconnue ou une valeur inconnue', async () => {
    prisma.user_applications.findMany.mockResolvedValue([
      { app_id: 'disparue', choix: 'ajoutee' },
      { app_id: 'parcours', choix: 'cachee' },
    ]);

    const bureau = await service.lanceurDe('u1');

    expect(ids(bureau.applications)).toContain('parcours');
  });

  it('enregistre le choix pour la personne connectée, puis rend le bureau recalculé', async () => {
    const bureau = await service.choisir('u1', 'portefeuille', 'ajoutee');

    expect(prisma.user_applications.upsert).toHaveBeenCalledWith({
      where: { user_id_app_id: { user_id: 'u1', app_id: 'portefeuille' } },
      create: { user_id: 'u1', app_id: 'portefeuille', choix: 'ajoutee' },
      update: { choix: 'ajoutee' },
    });
    expect(bureau.applications).toBeDefined();
  });

  it('refuse une application inconnue', async () => {
    await expect(service.choisir('u1', 'inconnue', 'ajoutee')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user_applications.upsert).not.toHaveBeenCalled();
  });

  it('refuse de ranger un réglage ou une application prévue', async () => {
    await expect(service.choisir('u1', 'profil', 'retiree')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.choisir('u1', 'equipe', 'ajoutee')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user_applications.upsert).not.toHaveBeenCalled();
  });

  describe('périmètre de la bêta V1', () => {
    const toutesLesVues = (bureau: Awaited<ReturnType<ApplicationsService['lanceurDe']>>) => [
      ...bureau.applications,
      ...bureau.suggestions,
      ...bureau.prevues,
      ...bureau.boutique,
      ...bureau.reglages,
    ];

    it('masque Portefeuille investisseur et Mentors & investisseurs par défaut', async () => {
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'investisseur' }]);

      const bureau = await service.lanceurDe('u1');

      expect(ids(toutesLesVues(bureau))).not.toContain('portefeuille');
      expect(ids(toutesLesVues(bureau))).not.toContain('reseau');
    });

    it("les montre à nouveau quand IGNITUX_BETA_V1='false'", async () => {
      env.current = { IGNITUX_BETA_V1: 'false' };
      prisma.user_roles.findMany.mockResolvedValue([{ role: 'investisseur' }]);

      const bureau = await service.lanceurDe('u1');

      expect(ids(bureau.applications)).toContain('portefeuille');
      expect(ids(bureau.applications)).toContain('reseau');
    });
  });
});
