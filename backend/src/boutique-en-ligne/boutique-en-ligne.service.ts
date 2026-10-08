import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OffresService } from '../offres/offres.service.js';
import { chiffrer, dechiffrer } from './chiffrement.js';
import {
  creerProduit as creerProduitShopify,
  echangerCodeContreJeton,
  listerCommandes as listerCommandesShopify,
  listerProduits as listerProduitsShopify,
  type ShopifyCredentials,
} from './shopify-admin-client.js';
import {
  construireUrlAutorisation,
  signerEtat,
  verifierEtat,
  verifierHmacCallback,
} from './shopify-oauth.js';

export interface EtatBoutique {
  connectee: boolean;
  shopDomain: string | null;
  forfaitDeclare: string | null;
  prixDeclareCentimes: number | null;
  connectedAt: string | null;
}

const DOMAINE_SHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const CLE_HEX_64 = /^[0-9a-fA-F]{64}$/;

interface Configuration {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

@Injectable()
export class BoutiqueEnLigneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offres: OffresService,
  ) {}

  /**
   * `null` quand la brique n'est pas configurée : une fonctionnalité
   * optionnelle absente ne doit jamais empêcher tout Ignitux de démarrer
   * (voir PAIEMENT_FOURNISSEUR="aucun", même principe). La clé de
   * chiffrement fait partie de cette configuration : sans elle, chiffrer()
   * lèverait au milieu d'un échange de code déjà consommé chez Shopify —
   * mieux vaut le dire avant de rediriger vers Shopify que pendant le
   * retour.
   */
  private configuration(): Configuration | null {
    const apiKey = process.env.SHOPIFY_API_KEY?.trim();
    const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
    const scopes = process.env.SHOPIFY_SCOPES?.trim();
    const appUrl = process.env.SHOPIFY_APP_URL?.trim();
    const cleChiffrement = process.env.SECRETS_ENCRYPTION_KEY?.trim();
    if (!apiKey || !apiSecret || !scopes || !appUrl) return null;
    if (!cleChiffrement || !CLE_HEX_64.test(cleChiffrement)) return null;
    return { apiKey, apiSecret, scopes, appUrl };
  }

  private exigerConfiguration(): Configuration {
    const config = this.configuration();
    if (!config) {
      throw new ServiceUnavailableException(
        'La connexion à Shopify n’est pas encore configurée côté Ignitux.',
      );
    }
    return config;
  }

  async etat(userId: string, projectId: string): Promise<EtatBoutique> {
    await assertOwnsProject(this.prisma, userId, projectId);
    const connexion = await this.prisma.shopify_connections.findFirst({
      where: { project_id: projectId, disconnected_at: null },
    });

    if (!connexion) {
      return {
        connectee: false,
        shopDomain: null,
        forfaitDeclare: null,
        prixDeclareCentimes: null,
        connectedAt: null,
      };
    }

    return {
      connectee: true,
      shopDomain: connexion.shop_domain,
      forfaitDeclare: connexion.forfait_declare,
      prixDeclareCentimes: connexion.prix_declare_centimes,
      connectedAt: connexion.connected_at.toISOString(),
    };
  }

  async demarrerConnexion(
    userId: string,
    projectId: string,
    shopDomain: string,
  ): Promise<{ url: string }> {
    await this.offres.exiger(userId, { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' });
    await assertOwnsProject(this.prisma, userId, projectId);

    const domaine = shopDomain.trim().toLowerCase();
    if (!DOMAINE_SHOPIFY.test(domaine)) {
      throw new BadRequestException('Le domaine doit être un sous-domaine « *.myshopify.com ».');
    }

    const config = this.exigerConfiguration();
    const state = signerEtat({ userId, projectId, shopDomain: domaine }, config.apiSecret);

    return {
      url: construireUrlAutorisation({
        shopDomain: domaine,
        apiKey: config.apiKey,
        scopes: config.scopes,
        redirectUri: `${config.appUrl}/boutique-en-ligne/callback`,
        state,
      }),
    };
  }

  /**
   * Appelé par le contrôleur public du callback (pas de session, pas de
   * base) pour décider où rediriger le navigateur. Ne vérifie que ce qui
   * ne demande aucune identité : la signature Shopify et la forme du
   * state. La vérification qui compte — que la personne qui finalise est
   * bien celle qui a démarré — vit dans finaliserConnexion, qui exige un
   * jeton Ignitux.
   */
  verifierSignatureCallback(query: Record<string, string>): { ok: boolean; projectId: string | null } {
    const config = this.configuration();
    if (!config) return { ok: false, projectId: null };
    if (!verifierHmacCallback(query, config.apiSecret)) return { ok: false, projectId: null };
    const etat = verifierEtat(query.state ?? '', config.apiSecret);
    if (!etat) return { ok: false, projectId: null };
    return { ok: true, projectId: etat.projectId };
  }

  /**
   * Finalise une connexion Shopify. Authentifié à dessein : un callback
   * public ne prouve que « Shopify a signé cette réponse », jamais « la
   * personne qui la présente est celle qui a démarré la demande ». Sans
   * cette exigence, quelqu'un pourrait démarrer une connexion vers la
   * boutique d'un tiers, lui envoyer le lien d'autorisation Shopify (réel,
   * légitime), et si ce tiers l'accepte, se retrouver avec l'accès à SA
   * boutique attaché au projet de l'attaquant.
   */
  async finaliserConnexion(
    callerId: string,
    projectId: string,
    query: { code: string; shop: string; state: string; hmac: string },
  ): Promise<void> {
    await this.offres.exiger(callerId, { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' });
    const config = this.exigerConfiguration();

    if (!verifierHmacCallback({ code: query.code, shop: query.shop, state: query.state, hmac: query.hmac }, config.apiSecret)) {
      throw new ForbiddenException('Signature Shopify invalide.');
    }

    const etat = verifierEtat(query.state ?? '', config.apiSecret);
    if (!etat) {
      throw new ForbiddenException('État de connexion invalide ou expiré.');
    }

    // Le cœur de la protection : seule la personne qui a démarré CETTE
    // connexion, pour CE projet, peut la finaliser — jamais quelqu'un
    // d'autre qui présenterait un code obtenu via le lien envoyé à un tiers.
    if (etat.userId !== callerId || etat.projectId !== projectId) {
      throw new ForbiddenException(
        'Cette connexion Shopify a été demandée par un autre compte ou pour un autre projet.',
      );
    }

    const domaineRecu = (query.shop ?? '').trim().toLowerCase();
    if (!DOMAINE_SHOPIFY.test(domaineRecu) || domaineRecu !== etat.shopDomain) {
      throw new BadRequestException(
        'Le domaine renvoyé par Shopify ne correspond pas à celui demandé.',
      );
    }

    await assertOwnsProject(this.prisma, callerId, projectId);

    let jeton;
    try {
      jeton = await echangerCodeContreJeton(domaineRecu, config.apiKey, config.apiSecret, query.code);
    } catch (erreur) {
      throw new BadGatewayException(
        `Shopify n’a pas confirmé la connexion : ${messageErreur(erreur)}`,
      );
    }

    await this.prisma.shopify_connections.upsert({
      where: { project_id: projectId },
      create: {
        project_id: projectId,
        shop_domain: domaineRecu,
        access_token_chiffre: chiffrer(jeton.accessToken),
        scopes: jeton.scope,
      },
      update: {
        shop_domain: domaineRecu,
        access_token_chiffre: chiffrer(jeton.accessToken),
        scopes: jeton.scope,
        connected_at: new Date(),
        disconnected_at: null,
      },
    });
  }

  async deconnecter(userId: string, projectId: string): Promise<void> {
    // Volontairement sans offres.exiger : une personne qui a rétrogradé
    // d'offre doit pouvoir couper une connexion existante, pas seulement
    // la voir. Ce que l'offre protège, c'est se connecter ou continuer à
    // utiliser la boutique — pas s'en détacher.
    const connexion = await this.trouverConnexionActive(userId, projectId);
    await this.prisma.shopify_connections.update({
      where: { id: connexion.id },
      data: { disconnected_at: new Date() },
    });
  }

  async declarerForfait(
    userId: string,
    projectId: string,
    forfait: string,
    prixCentimes: number,
  ): Promise<void> {
    await this.offres.exiger(userId, { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' });
    const connexion = await this.trouverConnexionActive(userId, projectId);
    await this.prisma.shopify_connections.update({
      where: { id: connexion.id },
      data: { forfait_declare: forfait, prix_declare_centimes: prixCentimes },
    });
  }

  private async trouverConnexionActive(userId: string, projectId: string) {
    await assertOwnsProject(this.prisma, userId, projectId);
    const connexion = await this.prisma.shopify_connections.findFirst({
      where: { project_id: projectId, disconnected_at: null },
    });
    if (!connexion) {
      throw new NotFoundException('Aucune boutique Shopify connectée pour ce projet.');
    }
    return connexion;
  }

  private dechiffrerJeton(connexion: { access_token_chiffre: string }): string {
    return dechiffrer(connexion.access_token_chiffre);
  }

  /**
   * Toutes les actions qui parlent réellement à Shopify exigent l'offre à
   * chaque appel — pas seulement à la connexion initiale. Une rétrogradation
   * d'offre après coup ne doit pas laisser un accès en lecture/écriture
   * illimité à une boutique tierce.
   */
  private async credentials(userId: string, projectId: string): Promise<ShopifyCredentials> {
    await this.offres.exiger(userId, { kind: 'outil_de_gestion', outil: 'boutique_en_ligne' });
    const connexion = await this.trouverConnexionActive(userId, projectId);
    return {
      shopDomain: connexion.shop_domain,
      accessToken: this.dechiffrerJeton(connexion),
    };
  }

  async listerProduits(userId: string, projectId: string) {
    const credentials = await this.credentials(userId, projectId);
    try {
      return await listerProduitsShopify(credentials);
    } catch (erreur) {
      throw new BadGatewayException(`Shopify n’a pas pu répondre : ${messageErreur(erreur)}`);
    }
  }

  async creerProduit(userId: string, projectId: string, titre: string, description: string | null) {
    const credentials = await this.credentials(userId, projectId);
    try {
      return await creerProduitShopify(credentials, titre, description);
    } catch (erreur) {
      throw new BadRequestException(`Shopify a refusé ce produit : ${messageErreur(erreur)}`);
    }
  }

  async listerCommandes(userId: string, projectId: string) {
    const credentials = await this.credentials(userId, projectId);
    try {
      return await listerCommandesShopify(credentials);
    } catch (erreur) {
      throw new BadGatewayException(`Shopify n’a pas pu répondre : ${messageErreur(erreur)}`);
    }
  }
}
