import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OffresService } from '../offres/offres.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';
import { chiffrer } from './chiffrement.js';
import * as shopifyAdmin from './shopify-admin-client.js';

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

  /** Démarre une connexion réelle et renvoie {code, shop, state} prêts pour finaliserConnexion. */
  async function demarrerEtObtenirCallback(
    userId = 'u1',
    projectId = 'p1',
    shopDomain = 'ma-boutique.myshopify.com',
  ) {
    vi.spyOn(shopifyAdmin, 'echangerCodeContreJeton').mockResolvedValue({
      accessToken: 'shpat_abc',
      scope: 'read_products',
    });
    const { url } = await service.demarrerConnexion(userId, projectId, shopDomain);
    const state = new URL(url).searchParams.get('state')!;

    // Signature HMAC construite comme le ferait Shopify, sur les mêmes
    // paramètres que verifierHmacCallback recompose (hmac exclu, triés) —
    // shopify-oauth.spec.ts prouve déjà l'algorithme lui-même, ici on veut
    // un HMAC réellement valide pour ne tester que finaliserConnexion.
    const { createHmac } = await import('node:crypto');
    const query = { code: 'code123', shop: shopDomain, state };
    const message = Object.keys(query)
      .sort()
      .map((cle) => `${cle}=${(query as Record<string, string>)[cle]}`)
      .join('&');
    const hmac = createHmac('sha256', Buffer.from(ENV_VALIDE.SHOPIFY_API_SECRET, 'utf8'))
      .update(message)
      .digest('hex');

    return { code: 'code123', shop: shopDomain, state, hmac };
  }

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
      await expect(service.demarrerConnexion('u1', 'p1', 'pas-un-domaine')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.demarrerConnexion('u1', 'p1', 'javascript:alert(1)'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('normalise la casse du domaine', async () => {
      const resultat = await service.demarrerConnexion('u1', 'p1', 'Ma-Boutique.MyShopify.com');
      expect(resultat.url).toContain('https://ma-boutique.myshopify.com/admin/oauth/authorize');
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

    it('refuse quand la clé de chiffrement est absente ou mal formée', async () => {
      delete process.env.SECRETS_ENCRYPTION_KEY;
      await expect(
        service.demarrerConnexion('u1', 'p1', 'ma-boutique.myshopify.com'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('verifierSignatureCallback', () => {
    it('accepte une signature et un state valides, et renvoie le projectId', async () => {
      const callback = await demarrerEtObtenirCallback();
      const resultat = service.verifierSignatureCallback(callback);
      expect(resultat).toEqual({ ok: true, projectId: 'p1' });
    });

    it('refuse un HMAC invalide', async () => {
      const callback = await demarrerEtObtenirCallback();
      const resultat = service.verifierSignatureCallback({ ...callback, hmac: 'faux' });
      expect(resultat.ok).toBe(false);
    });

    it('ne lève jamais, même sans configuration', () => {
      delete process.env.SHOPIFY_API_KEY;
      expect(() => service.verifierSignatureCallback({ hmac: 'x' })).not.toThrow();
    });
  });

  describe('finaliserConnexion', () => {
    it('échange le code, chiffre le jeton, et enregistre la connexion', async () => {
      const callback = await demarrerEtObtenirCallback();

      await service.finaliserConnexion('u1', 'p1', callback);

      expect(prisma.shopify_connections.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { project_id: 'p1' } }),
      );
    });

    it('exige la capacité outil_de_gestion / boutique_en_ligne', async () => {
      const callback = await demarrerEtObtenirCallback();
      offres.exiger.mockClear();
      await service.finaliserConnexion('u1', 'p1', callback);
      expect(offres.exiger).toHaveBeenCalledWith('u1', {
        kind: 'outil_de_gestion',
        outil: 'boutique_en_ligne',
      });
    });

    it('refuse un state invalide sans toucher la base', async () => {
      // HMAC réellement valide pour cette requête (sinon c'est ce contrôle,
      // et non celui du state, qui refuserait — voir le test équivalent
      // dans shopify-oauth.spec.ts pour l'état lui-même).
      const query = { code: 'c', shop: 's', state: 'invalide' };
      const { createHmac } = await import('node:crypto');
      const message = Object.keys(query)
        .sort()
        .map((cle) => `${cle}=${(query as Record<string, string>)[cle]}`)
        .join('&');
      const hmac = createHmac('sha256', Buffer.from(ENV_VALIDE.SHOPIFY_API_SECRET, 'utf8'))
        .update(message)
        .digest('hex');

      await expect(
        service.finaliserConnexion('u1', 'p1', { ...query, hmac }),
      ).rejects.toThrow();
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });

    it('refuse un HMAC invalide sans toucher la base', async () => {
      const callback = await demarrerEtObtenirCallback();
      await expect(
        service.finaliserConnexion('u1', 'p1', { ...callback, hmac: 'faux' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });

    // Le scénario que cette protection ferme : quelqu'un démarre une
    // connexion pour SON projet mais vers la boutique d'un tiers, et
    // envoie le lien d'autorisation Shopify (authentique) à ce tiers. Si le
    // tiers l'accepte, Shopify renvoie un HMAC et un state parfaitement
    // valides — la seule chose qui doit encore arrêter l'attaque est que
    // CELUI QUI FINALISE (ici : le tiers, connecté sous son propre compte)
    // n'est pas celui qui a démarré la demande.
    it('refuse de finaliser pour un autre compte que celui qui a démarré la demande', async () => {
      const callback = await demarrerEtObtenirCallback('attaquant', 'p-attaquant');
      await expect(
        service.finaliserConnexion('victime', 'p-attaquant', callback),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });

    it('refuse de finaliser pour un autre projet que celui déclaré au départ', async () => {
      const callback = await demarrerEtObtenirCallback('u1', 'p1');
      await expect(service.finaliserConnexion('u1', 'p-autre', callback)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });

    it('refuse quand le domaine renvoyé par Shopify diffère de celui demandé', async () => {
      // Le HMAC doit rester valide POUR le domaine substitué (sinon c'est la
      // vérification HMAC qui refuserait, pas celle qu'on veut isoler ici) :
      // on recalcule un HMAC authentique sur la requête altérée, comme le
      // ferait un vrai callback Shopify pour cette autre boutique.
      const callback = await demarrerEtObtenirCallback('u1', 'p1', 'ma-boutique.myshopify.com');
      const requeteAlteree = { ...callback, shop: 'autre-boutique.myshopify.com' };
      const { createHmac } = await import('node:crypto');
      const message = ['code', 'shop', 'state']
        .sort()
        .map((cle) => `${cle}=${(requeteAlteree as Record<string, string>)[cle]}`)
        .join('&');
      requeteAlteree.hmac = createHmac('sha256', Buffer.from(ENV_VALIDE.SHOPIFY_API_SECRET, 'utf8'))
        .update(message)
        .digest('hex');

      await expect(service.finaliserConnexion('u1', 'p1', requeteAlteree)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.shopify_connections.upsert).not.toHaveBeenCalled();
    });

    it('traduit un échec Shopify en erreur lisible plutôt que de laisser planter', async () => {
      const callback = await demarrerEtObtenirCallback();
      vi.spyOn(shopifyAdmin, 'echangerCodeContreJeton').mockRejectedValue(new Error('500'));
      await expect(service.finaliserConnexion('u1', 'p1', callback)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('declarerForfait', () => {
    it('exige la capacité outil_de_gestion / boutique_en_ligne', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({ id: 'c1' });
      await service.declarerForfait('u1', 'p1', 'Basic', 2900);
      expect(offres.exiger).toHaveBeenCalledWith('u1', {
        kind: 'outil_de_gestion',
        outil: 'boutique_en_ligne',
      });
    });

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
    it('marque la connexion comme déconnectée, sans exiger l’offre', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue({ id: 'c1' });
      await service.deconnecter('u1', 'p1');
      expect(prisma.shopify_connections.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { disconnected_at: expect.any(Date) },
      });
      expect(offres.exiger).not.toHaveBeenCalled();
    });
  });

  describe('produits et commandes', () => {
    beforeEach(() => {
      prisma.shopify_connections.findFirst.mockResolvedValue({
        id: 'c1',
        shop_domain: 'ma-boutique.myshopify.com',
        access_token_chiffre: chiffrer('shpat_reel'),
      });
    });

    it('exige la capacité outil_de_gestion / boutique_en_ligne avant de lister les produits', async () => {
      vi.spyOn(shopifyAdmin, 'listerProduits').mockResolvedValue([]);
      await service.listerProduits('u1', 'p1');
      expect(offres.exiger).toHaveBeenCalledWith('u1', {
        kind: 'outil_de_gestion',
        outil: 'boutique_en_ligne',
      });
    });

    it('refuse de lister les produits quand l’offre ne le permet plus', async () => {
      offres.exiger.mockRejectedValue(new ForbiddenException('offre insuffisante'));
      await expect(service.listerProduits('u1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('liste les produits de la boutique connectée', async () => {
      const spy = vi
        .spyOn(shopifyAdmin, 'listerProduits')
        .mockResolvedValue([{ id: 'gid://1', title: 'Bougie', status: 'ACTIVE', totalInventory: 5 }]);

      const produits = await service.listerProduits('u1', 'p1');

      expect(spy).toHaveBeenCalledWith({
        shopDomain: 'ma-boutique.myshopify.com',
        accessToken: 'shpat_reel',
      });
      expect(produits).toHaveLength(1);
    });

    it('refuse de lister les produits sans boutique connectée', async () => {
      prisma.shopify_connections.findFirst.mockResolvedValue(null);
      await expect(service.listerProduits('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('traduit un échec Shopify en erreur lisible plutôt que de renvoyer undefined', async () => {
      vi.spyOn(shopifyAdmin, 'listerProduits').mockRejectedValue(new Error('502'));
      await expect(service.listerProduits('u1', 'p1')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('crée un produit sur la boutique connectée', async () => {
      const spy = vi
        .spyOn(shopifyAdmin, 'creerProduit')
        .mockResolvedValue({ id: 'gid://2', title: 'Savon', status: 'DRAFT', totalInventory: 0 });

      const produit = await service.creerProduit('u1', 'p1', 'Savon', null);

      expect(spy).toHaveBeenCalledWith(
        { shopDomain: 'ma-boutique.myshopify.com', accessToken: 'shpat_reel' },
        'Savon',
        null,
      );
      expect(produit.title).toBe('Savon');
    });

    it('liste les commandes de la boutique connectée', async () => {
      vi.spyOn(shopifyAdmin, 'listerCommandes').mockResolvedValue([]);
      const commandes = await service.listerCommandes('u1', 'p1');
      expect(commandes).toEqual([]);
    });
  });
});
