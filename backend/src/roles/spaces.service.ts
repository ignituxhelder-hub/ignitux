import { Injectable } from '@nestjs/common';
import { buildCapTable } from '../financing/financing-model.js';
import { InvestorsService } from '../investors/investors.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from './roles.service.js';

/** Une ligne du tableau de bord investisseur : un projet, vu de dehors. */
export interface InvestorSpaceLine {
  financedProjectId: string;
  projectId: string | null;
  projectTitle: string;
  status: string;
  investedCents: number;
  repaidCents: number;
  dividendsCents: number;
  gainsCents: number;
  netCents: number;
  /**
   * La part détenue **aujourd'hui**, en points de base, lue dans la table de
   * capitalisation — jamais celle accordée à l'apport, qui a pu changer.
   *
   * null quand aucun détenteur n'est rattaché à la participation : l'apport
   * ne donnait pas de part (prêt, avance), ou le rattachement n'a pas été
   * fait. On ne devine pas un pourcentage.
   */
  shareBasisPoints: number | null;
  /** Pourquoi la part est nulle, quand elle l'est. */
  shareNotice: string | null;
  participations: number;
}

export interface InvestorSpace {
  role: 'investisseur';
  investorId: string | null;
  displayName: string | null;
  global: {
    investedCents: number;
    repaidCents: number;
    dividendsCents: number;
    gainsCents: number;
    netCents: number;
    projectCount: number;
  };
  lines: InvestorSpaceLine[];
  notice: string;
}

export interface EntrepreneurSpace {
  role: 'entrepreneur';
  projects: Array<{
    id: string;
    title: string;
    description: string | null;
    isPublic: boolean;
    updatedAt: string | null;
  }>;
  counts: { projects: number; publicProjects: number; contacts: number; issuedDocuments: number };
  notice: string;
}

/**
 * LES DEUX ESPACES.
 *
 * Chaque espace est une **lecture**, pas un magasin. Il n'écrit rien, il ne
 * possède rien, et il assemble ce que les modules existants savent déjà
 * rendre : c'est ce qui permet à une même personne d'avoir deux espaces sans
 * qu'aucune donnée n'existe en double.
 *
 * Avant de servir, chaque espace déclare au moteur constitutionnel les
 * domaines qu'il s'apprête à rendre. Si l'un d'eux ne relève pas du rôle, la
 * règle `roles-separes` refuse la vue — et le refus vaut aussi pour moi, le
 * jour où j'ajouterais par distraction une ligne d'entrepreneur au tableau
 * de bord investisseur.
 */
@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly investors: InvestorsService,
  ) {}

  async entrepreneurSpace(userId: string): Promise<EntrepreneurSpace> {
    await this.roles.assertViewIsSeparated(userId, 'entrepreneur', [
      'projets',
      'relations',
      'facturation',
    ]);

    const [projects, contacts, issuedDocuments] = await Promise.all([
      this.prisma.projects.findMany({
        where: { owner_id: userId },
        orderBy: { updated_at: 'desc' },
      }),
      this.prisma.crm_contacts.count({ where: { owner_id: userId } }),
      this.prisma.billing_documents.count({
        where: { owner_id: userId, status: { not: 'brouillon' } },
      }),
    ]);

    return {
      role: 'entrepreneur',
      projects: projects.map((projet) => ({
        id: projet.id,
        title: projet.title,
        description: projet.description,
        isPublic: projet.is_public,
        updatedAt: projet.updated_at?.toISOString() ?? null,
      })),
      counts: {
        projects: projects.length,
        publicProjects: projects.filter((projet) => projet.is_public).length,
        contacts,
        issuedDocuments,
      },
      notice:
        "Cet espace ne montre que ce que tu portes. L'argent que tu as placé dans les " +
        "projets d'autres personnes vit dans l'espace Investisseur, et les deux ne " +
        's’additionnent nulle part.',
    };
  }

  async investorSpace(userId: string): Promise<InvestorSpace> {
    await this.roles.assertViewIsSeparated(userId, 'investisseur', [
      'investissements',
      'portefeuille',
    ]);

    const investor = await this.prisma.investors.findFirst({ where: { user_id: userId } });

    // Tenir le rôle sans avoir encore investi est un état normal, pas une
    // erreur : on rend un espace vide qui le dit, plutôt qu'un 404.
    if (!investor) {
      return {
        role: 'investisseur',
        investorId: null,
        displayName: null,
        global: {
          investedCents: 0,
          repaidCents: 0,
          dividendsCents: 0,
          gainsCents: 0,
          netCents: 0,
          projectCount: 0,
        },
        lines: [],
        notice:
          "Aucun investissement n'est enregistré à ton nom. Cet espace se remplira quand " +
          "le porteur d'un projet enregistrera ton apport.",
      };
    }

    const portefeuille = await this.investors.portfolio(investor.id);
    const lines = await Promise.all(
      portefeuille.parProjet.map((ligne) => this.enrich(investor.id, ligne)),
    );

    return {
      role: 'investisseur',
      investorId: investor.id,
      displayName: portefeuille.displayName,
      global: { ...portefeuille.global, projectCount: portefeuille.parProjet.length },
      lines,
      notice:
        "Chaque projet totalise ses propres mouvements : rien ne se compense d'un projet " +
        "à l'autre. Ignitux n'affiche aucun rendement prévisionnel — ce qui est écrit ici " +
        "a réellement eu lieu.",
    };
  }

  /**
   * Ajoute à une ligne de portefeuille la part réellement détenue.
   *
   * Elle se lit dans la table de capitalisation du projet, jamais dans la
   * participation : `share_basis_points_granted` est ce qui a été accordé le
   * jour de l'apport, et une dilution ultérieure ne l'aurait pas modifié.
   * Afficher ce chiffre comme la part d'aujourd'hui serait un mensonge par
   * péremption.
   */
  private async enrich(
    investorId: string,
    ligne: {
      financedProjectId: string;
      projectId: string | null;
      projectTitle: string;
      status: string;
      participations: number;
      totals: {
        investedCents: number;
        repaidCents: number;
        dividendsCents: number;
        gainsCents: number;
        netCents: number;
      };
    },
  ): Promise<InvestorSpaceLine> {
    const base: InvestorSpaceLine = {
      financedProjectId: ligne.financedProjectId,
      projectId: ligne.projectId,
      projectTitle: ligne.projectTitle,
      status: ligne.status,
      ...ligne.totals,
      shareBasisPoints: null,
      shareNotice: null,
      participations: ligne.participations,
    };

    if (!ligne.projectId) {
      return {
        ...base,
        shareNotice: "Le projet n'existe plus ; sa répartition n'est plus consultable.",
      };
    }

    const participations = await this.prisma.participations.findMany({
      where: { investor_id: investorId, financed_project_id: ligne.financedProjectId },
      select: { equity_holder_id: true },
    });
    const holderIds = participations
      .map((participation) => participation.equity_holder_id)
      .filter((id): id is string => id !== null);

    if (holderIds.length === 0) {
      return {
        ...base,
        shareNotice:
          "Aucune part n'est rattachée à cet apport : il ne donnait pas de capital, ou le " +
          "rattachement n'a pas été fait.",
      };
    }

    const [holders, events] = await Promise.all([
      this.prisma.equity_holders.findMany({ where: { project_id: ligne.projectId } }),
      this.prisma.equity_events.findMany({
        where: { project_id: ligne.projectId },
        orderBy: { occurred_at: 'asc' },
      }),
    ]);

    const capTable = buildCapTable(holders, events);
    const miennes = capTable.holders.filter((share) => holderIds.includes(share.holderId));
    const connues = miennes.filter((share) => share.shareBasisPoints !== null);

    if (connues.length === 0) {
      return {
        ...base,
        shareNotice:
          'Un détenteur existe pour cet apport, mais aucune répartition ne lui a encore ' +
          'été attribuée.',
      };
    }

    return {
      ...base,
      shareBasisPoints: connues.reduce(
        (total, share) => total + (share.shareBasisPoints ?? 0),
        0,
      ),
    };
  }
}
