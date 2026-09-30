import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { betaV1Actif } from '../config/beta-v1.js';
import { getEnv } from '../config/env.js';
import { offre } from '../offres/offres-catalogue.js';
import { OffresService } from '../offres/offres.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isRoleId, type RoleId } from '../roles/roles-catalogue.js';
import {
  estChoixBureau,
  estRangeable,
  lanceur,
  type ChoixBureau,
  type Lanceur,
} from './activation.js';
import {
  findApplication,
  MASQUEES_EN_BETA_V1,
  type ApplicationId,
} from './applications-catalogue.js';

/**
 * Retire du bureau ce qui est hors périmètre pendant la bêta V1. Ne
 * supprime aucune donnée : c'est une vue, recalculée à chaque appel.
 */
function masquerBetaV1(bureau: Lanceur): Lanceur {
  const garder = (vue: { id: ApplicationId }) => !MASQUEES_EN_BETA_V1.includes(vue.id);
  return {
    ...bureau,
    applications: bureau.applications.filter(garder),
    suggestions: bureau.suggestions.filter(garder),
    prevues: bureau.prevues.filter(garder),
    boutique: bureau.boutique.filter(garder),
    reglages: bureau.reglages.filter(garder),
  };
}

/**
 * Lit ce que le moteur d'activation a besoin de savoir, et lui pose la
 * question. Le raisonnement n'est pas ici : il vit dans `activation.ts`, qui
 * est pur.
 *
 * Tout se lit par `owner_id` / `user_id` de la personne connectée : aucune
 * route ne prend l'identifiant de quelqu'un d'autre, et les compteurs ne
 * rendent que des nombres — jamais une ligne.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offres: OffresService,
  ) {}

  async lanceurDe(userId: string): Promise<Lanceur> {
    const [
      roles,
      projets,
      contacts,
      documents,
      ecritures,
      comptesBancaires,
      investisseur,
      offreId,
      bureau,
    ] = await Promise.all([
        this.prisma.user_roles.findMany({ where: { user_id: userId }, select: { role: true } }),
        this.prisma.projects.findMany({ where: { owner_id: userId }, select: { sector: true } }),
        this.prisma.crm_contacts.count({ where: { owner_id: userId } }),
        this.prisma.billing_documents.count({ where: { owner_id: userId } }),
        this.prisma.ledger_entries.count({ where: { owner_type: 'user', owner_id: userId } }),
        this.prisma.bank_accounts.count({ where: { owner_type: 'user', owner_id: userId } }),
        this.prisma.investors.findFirst({ where: { user_id: userId }, select: { id: true } }),
        this.offres.offreDe(userId),
        this.prisma.user_applications.findMany({
          where: { user_id: userId },
          select: { app_id: true, choix: true },
        }),
      ]);

    const investissements = investisseur
      ? await this.prisma.participations.count({ where: { investor_id: investisseur.id } })
      : 0;

    const secteurs = [
      ...new Set(projets.map((projet) => projet.sector).filter((s): s is string => !!s)),
    ];

    // Un choix sur une application disparue du catalogue, ou une valeur
    // inconnue, est ignoré — comme les rôles, pour ne jamais casser l'accueil.
    const choix: Partial<Record<ApplicationId, ChoixBureau>> = {};
    for (const ligne of bureau) {
      if (findApplication(ligne.app_id) && estChoixBureau(ligne.choix)) {
        choix[ligne.app_id as ApplicationId] = ligne.choix;
      }
    }

    const brut = lanceur({
      choix,
      // Un rôle inconnu en base (reste d'une ancienne version) est ignoré
      // plutôt que de faire échouer l'écran d'accueil.
      roles: roles.map((ligne) => ligne.role).filter((role): role is RoleId => isRoleId(role)),
      usage: {
        projets: projets.length,
        contacts,
        documents,
        ecritures,
        comptesBancaires,
        investissements,
      },
      secteurs,
      outilsDeGestion: offre(offreId).capacites.outilsDeGestion,
    });

    return betaV1Actif(getEnv().IGNITUX_BETA_V1) ? masquerBetaV1(brut) : brut;
  }

  /**
   * Ajouter une application au bureau, ou l'en retirer. Seules les
   * applications disponibles et hors réglages se rangent : un réglage reste
   * toujours accessible, une application prévue n'existe pas encore.
   *
   * Retirer n'efface rien — ni factures ni contacts. C'est l'icône qui part,
   * pas les données.
   */
  async choisir(userId: string, appId: string, choix: ChoixBureau): Promise<Lanceur> {
    const app = findApplication(appId);
    if (!app) throw new NotFoundException("Cette application n'existe pas.");
    if (!estRangeable(app)) {
      throw new BadRequestException(
        app.statut === 'prevue'
          ? "Cette application n'est pas encore disponible."
          : 'Les réglages restent toujours accessibles : ils ne se rangent pas.',
      );
    }

    await this.prisma.user_applications.upsert({
      where: { user_id_app_id: { user_id: userId, app_id: app.id } },
      create: { user_id: userId, app_id: app.id, choix },
      update: { choix },
    });

    return this.lanceurDe(userId);
  }
}
