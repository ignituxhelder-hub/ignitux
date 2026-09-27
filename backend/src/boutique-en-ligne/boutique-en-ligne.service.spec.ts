import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { OffresService } from '../offres/offres.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';
import * as shopifyAdmin from './shopify-admin-client.js';
import * as shopifyOauth from './shopify-oauth.js';

type Mock = ReturnType<typeof vi.fn>;

const ENV_VALIDE = {
  SHOPIFY_API_KEY: 'cle',
  SHOPIFY_API_SECRET: 'secret-suffisamment-long',
  SHOPIFY_SCOPES: 'read_products,write_products,read_orders',
  SHOPIFY_APP_URL: 'https://api.ignitux.fr',
  SECRETS_ENCRYPTION_KEY: 'a'.repeat(64),
  FRONTEND_URL: 'https://ignitux.fr',
};

describe('BoutiqueEnLigneService', () => {
  let service: BoutiqueEnLigneService;
  let prisma: {
    projects: { findFirst: Mock };
    shopify_connections: { findFirst: Mock; upsert: Mock; update: Mock };
  };
  let offres: { exiger: Mock };
  const anciennesEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV_VALIDE);
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', owner_id: 'u1' }) },
      shopify_connections: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    offres = { exiger: vi.fn().mockResolvedValue(undefined) };
    service = new BoutiqueEnLigneService(
      prisma as unknown as PrismaService,
      offres as unknown as OffresService,
    );
  });

  afterEach(() => {
    process.env = { ...anciennesEnv };
    vi.restoreAllMocks();
  });

  describe('etat', () => {
    it('refuse un projet qui n’appartient pas à l’appelant', async () => {
      prisma.projects.findFirst.mockResolvedValue(null);
      await expect(service.etat('u1', 'p-autrui')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rend "non connectée" quand aucune ligne n’existe', async () => {
      const etat = await service.etat('u1', 'p1');
      expect(etat).toEqual({
        connectee: false,
        shopDomain: null,
        forfaitDeclare: null,
        prixDeclareCentimes: null,
        connectedAt: null,
      });
    });

    it('rend l’état connecté quand une ligne active existe', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({
        shop_domain: 'ma-boutique.myshopify.com',
        forfait_declare: 'Basic',
        prix_declare_centimes: 2900,
        connected_at: new Date('2026-09-20T00:00:00Z'),
        disconnected_at: null,
      });

      const etat = await service.etat('u1', 'p1');
      expect(etat.connectee).toBe(true);
      expect(etat.shopDomain).toBe('ma-boutique.myshopify.com');
    });
  });

  describe('demarrerConnexion', () => {
    it('exige la capacité outil_de_gestion / boutique_en_ligne', async () => {
      await service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com');
      expect(offres.exiger).toHaveBeenCalledWith('u1', {
        kind: 'outil_de_gestion',
        outil: 'boutique_en_ligne',
      });
    });

    it('refuse un domaine qui n’est pas un sous-domaine myshopify.com', async () => {
      await expect(service.demarrerConnexion('u1', 'p1', 'pas-un-domaine')).rejects.toThrow(
        /myshopify\.com/,
      );
      await expect(
        service.demarrerConnexion('u1', 'p1', 'javascript:alert(1)'),
      ).rejects.toThrow(/myshopify\.com/);
    });

    it('renvoie une URL Shopify avec un state signé', async () => {
      const resultat = await service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com');
      expect(resultat.url).toContain('https://ma-boutique.myshopify.com/admin/oauth/authorize');
      expect(resultat.url).toContain('client_id=cle');
    });

    it('refuse quand Shopify n’est pas configuré', async () => {
      delete process.env.SHOPIFY_API_KEY;
      await expect(
        service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('traiterCallback', () => {
    it('échange le code, chiffre le jeton, et enregistre la connexion', async () => {
      vi.spyOn(shopifyAdmin, 'echangerCodeContreJeton').mockResolvedValue({
        accessToken: 'shpat_abc',
        scope: 'read_products',
      });
      // La vérification HMAC elle-même est testée dans shopify-oauth.spec.ts ;
      // ici on suppose Shopify authentique pour isoler le comportement du
      // service (échange, chiffrement, upsert).
      vi.spyOn(shopifyOauth, 'verifierHmacCallback').mockReturnValue(true);

      const { url } = await service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com');
      const state = new URL(url).searchParams.get('state')!;

      await service.traiterCallback({
        shop: 'ma-boutique.myshopify.com',
        code: 'code123',
        state,
        hmac: 'peu-importe-ici',
        timestamp: '123',
      });

      expect(prisma.shopify_connections.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { project_id: 'p1' },
        }),
      );
    });

    it('refuse un state invalide sans toucher la base', async () => {
      await expect(
        service.traiterCallback({ shop: 's', code: 'c', state: 'invalide', hmac: 'x' }),
      ).rejects.toThrow();
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });
  });

  describe('declarerForfait', () => {
    it('refuse quand aucune connexion n’existe encore', async () => {
      await expect(
        service.declarerForfait('u1', 'p1', 'Basic', 2900),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('met à jour le forfait déclaré sur une connexion existante', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({ id: 'c1' });
      await service.declarerForfait('u1', 'p1', 'Basic', 2900);
      expect(prisma.shopify_connections.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { forfait_declare: 'Basic', prix_declare_centimes: 2900 },
      });
    });
  });

  describe('deconnecter', () => {
    it('marque la connexion comme déconnectée', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({ id: 'c1' });
      await service.deconnecter('u1', 'p1');
      expect(prisma.shopify_connections.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { disconnected_at: expect.any(Date) },
      });
    });
  });
});
