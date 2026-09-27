import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OffresService } from '../offres/offres.service.js';
import { chiffrer, dechiffrer } from './chiffrement.js';
import { echangerCodeContreJeton } from './shopify-admin-client.js';
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

interface Configuration {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
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
   * (voir PAIEMENT_FOURNISSEUR="aucun", même principe).
   */
  private configuration(): Configuration | null {
    const apiKey = process.env.SHOPIFY_API_KEY?.trim();
    const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
    const scopes = process.env.SHOPIFY_SCOPES?.trim();
    const appUrl = process.env.SHOPIFY_APP_URL?.trim();
    if (!apiKey || !apiSecret || !scopes || !appUrl) return null;
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

    if (!DOMAINE_SHOPIFY.test(shopDomain)) {
      throw new Error('Le domaine doit être un sous-domaine « *.myshopify.com ».');
    }

    const config = this.exigerConfiguration();
    const state = signerEtat({ userId, projectId }, config.apiSecret);

    return {
      url: construireUrlAutorisation({
        shopDomain,
        apiKey: config.apiKey,
        scopes: config.scopes,
        redirectUri: `${config.appUrl}/boutique-en-ligne/callback`,
        state,
      }),
    };
  }

  async traiterCallback(query: Record<string, string>): Promise<void> {
    const config = this.exigerConfiguration();

    if (!verifierHmacCallback(query, config.apiSecret)) {
      throw new Error('Signature Shopify invalide.');
    }

    const etat = verifierEtat(query.state ?? '', config.apiSecret);
    if (!etat) {
      throw new Error('État de connexion invalide ou expiré.');
    }

    // Défense en profondeur : le state a déjà prouvé l'appartenance au
    // moment de démarrerConnexion, mais un projet a pu être supprimé ou
    // transféré entre-temps.
    await assertOwnsProject(this.prisma, etat.userId, etat.projectId);

    const jeton = await echangerCodeContreJeton(
      query.shop,
      config.apiKey,
      config.apiSecret,
      query.code,
    );

    await this.prisma.shopify_connections.upsert({
      where: { project_id: etat.projectId },
      create: {
        project_id: etat.projectId,
        shop_domain: query.shop,
        access_token_chiffre: chiffrer(jeton.accessToken),
        scopes: jeton.scope,
      },
      update: {
        shop_domain: query.shop,
        access_token_chiffre: chiffrer(jeton.accessToken),
        scopes: jeton.scope,
        connected_at: new Date(),
        disconnected_at: null,
      },
    });
  }

  async deconnecter(userId: string, projectId: string): Promise<void> {
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
    const connexion = await this.trouverConnexionActive(userId, projectId);
    await this.prisma.shopify_connections.update({
      where: { id: connexion.id },
      data: { forfait_declare: forfait, prix_declare_centimes: prixCentimes },
    });
  }

  /** Partagé avec Task 8 : les méthodes produits/commandes en ont aussi besoin. */
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

  /** Partagé avec Task 8. */
  private dechiffrerJeton(connexion: { access_token_chiffre: string }): string {
    return dechiffrer(connexion.access_token_chiffre);
  }
}
