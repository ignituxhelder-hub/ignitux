import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { assertHasProjectAccess } from '../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BUYBACK_SCOPE_NOTICE,
  buybackProgress,
  type BuybackCondition,
} from './buyback-progress.js';
import {
  buildCapTable,
  FINANCING_SCOPE_NOTICE,
  founderTrajectory,
  TOTAL_BASIS_POINTS,
  type FinancingSource,
} from './financing-model.js';

/**
 * FINANCEMENT IGNITUX — suivi des financements, des parts et des
 * dividendes réellement versés.
 *
 * Lecture ouverte aux collaborateurs du projet, écriture réservée au
 * porteur : la répartition du capital est une information qu'un
 * collaborateur a besoin de connaître, mais qu'il n'a aucune légitimité à
 * modifier. C'est l'application directe de « l'entrepreneur reste
 * propriétaire principal ».
 *
 * Voir financing-model.ts pour ce que ce module refuse de calculer.
 */
@Injectable()
export class FinancingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitutionService: ConstitutionService,
  ) {}

  async getScopeNotice() {
    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'financement',
      notice: FINANCING_SCOPE_NOTICE,
    });

    return { notice: FINANCING_SCOPE_NOTICE };
  }

  // ------------------------------------------------------------ financements

  async recordRound(
    userId: string,
    projectId: string,
    source: FinancingSource,
    amountCents: number,
    occurredAt: Date,
    note?: string,
  ) {
    await assertOwnsProject(this.prisma, userId, projectId);
    if (amountCents <= 0) {
      throw new BadRequestException('Un financement doit porter un montant strictement positif.');
    }

    return this.prisma.financing_rounds.create({
      data: { project_id: projectId, source, amount_cents: amountCents, occurred_at: occurredAt, note },
    });
  }

  async listRounds(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const rounds = await this.prisma.financing_rounds.findMany({
      where: { project_id: projectId },
      orderBy: { occurred_at: 'desc' },
    });

    return {
      rounds,
      // Un total de ce qui a été réellement reçu : c'est une somme, pas
      // un plan de financement.
      totalCents: rounds.reduce((total, round) => total + round.amount_cents, 0),
    };
  }

  async deleteRound(userId: string, roundId: string) {
    const round = await this.prisma.financing_rounds.findFirst({ where: { id: roundId } });
    if (!round) {
      throw new NotFoundException('Financement introuvable.');
    }
    await assertOwnsProject(this.prisma, userId, round.project_id);

    await this.prisma.financing_rounds.delete({ where: { id: roundId } });
  }

  // ------------------------------------------------------------- détenteurs

  async addHolder(userId: string, projectId: string, name: string, isFounder: boolean) {
    await assertOwnsProject(this.prisma, userId, projectId);

    return this.prisma.equity_holders.create({
      data: { project_id: projectId, name, is_founder: isFounder },
    });
  }

  async removeHolder(userId: string, holderId: string) {
    const holder = await this.findHolderForOwner(userId, holderId);
    // L'historique des parts part en cascade avec le détenteur : garder
    // des événements orphelins produirait une répartition qui ne boucle
    // plus et que personne ne saurait expliquer.
    await this.prisma.equity_holders.delete({ where: { id: holder.id } });
  }

  /**
   * Enregistre un changement de répartition. La part est saisie, jamais
   * calculée : Ignitux n'a pas de règle de dilution à appliquer.
   */
  async recordEquityChange(
    userId: string,
    holderId: string,
    shareBasisPoints: number,
    reason: string,
    occurredAt: Date,
  ) {
    const holder = await this.findHolderForOwner(userId, holderId);

    if (shareBasisPoints < 0 || shareBasisPoints > TOTAL_BASIS_POINTS) {
      throw new BadRequestException('Une part doit être comprise entre 0 et 100 %.');
    }

    // Article 22 (Financement Éthique) : on simule la répartition APRÈS ce
    // changement et on la soumet au moteur constitutionnel. Le modèle
    // IGNITUX pose que l'entrepreneur reste propriétaire principal — une
    // écriture qui le ferait passer sous la majorité est refusée, y compris
    // à la demande du porteur lui-même.
    const projection = await this.projectShares(holder.project_id, holderId, shareBasisPoints);
    await this.constitutionService.guard(
      {
        kind: 'set_equity',
        holderName: holder.name,
        isFounder: holder.is_founder,
        founderBasisPointsAfter: projection.founderBasisPoints,
        totalBasisPointsAfter: projection.totalBasisPoints,
      },
      { userId, projectId: holder.project_id },
    );

    return this.prisma.equity_events.create({
      data: {
        project_id: holder.project_id,
        holder_id: holderId,
        share_basis_points: shareBasisPoints,
        reason,
        occurred_at: occurredAt,
      },
    });
  }

  /**
   * Répartition courante et trajectoire du porteur. Lecture ouverte aux
   * collaborateurs.
   */
  async getCapTable(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const [holders, events] = await Promise.all([
      this.prisma.equity_holders.findMany({
        where: { project_id: projectId },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.equity_events.findMany({
        where: { project_id: projectId },
        orderBy: { occurred_at: 'asc' },
      }),
    ]);

    const founderIds = new Set(
      holders.filter((holder) => holder.is_founder).map((holder) => holder.id),
    );

    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'financement',
      notice: FINANCING_SCOPE_NOTICE,
    });

    return {
      notice: FINANCING_SCOPE_NOTICE,
      ...buildCapTable(holders, events),
      founderTrajectory: founderTrajectory(founderIds, events),
    };
  }

  async listEquityEvents(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    return this.prisma.equity_events.findMany({
      where: { project_id: projectId },
      orderBy: { occurred_at: 'desc' },
      include: { holder: true },
    });
  }

  // -------------------------------------------------------------- dividendes

  async recordDividend(
    userId: string,
    holderId: string,
    amountCents: number,
    occurredAt: Date,
    note?: string,
  ) {
    const holder = await this.findHolderForOwner(userId, holderId);
    if (amountCents <= 0) {
      throw new BadRequestException('Un dividende versé porte un montant strictement positif.');
    }

    return this.prisma.dividend_distributions.create({
      data: {
        project_id: holder.project_id,
        holder_id: holderId,
        amount_cents: amountCents,
        occurred_at: occurredAt,
        note,
      },
    });
  }

  async listDividends(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const dividends = await this.prisma.dividend_distributions.findMany({
      where: { project_id: projectId },
      orderBy: { occurred_at: 'desc' },
      include: { holder: true },
    });

    return {
      dividends,
      totalCents: dividends.reduce((total, dividend) => total + dividend.amount_cents, 0),
    };
  }

  /**
   * Répartition telle qu'elle serait si `holderId` passait à
   * `newShareBasisPoints`. Sert uniquement au contrôle constitutionnel :
   * on vérifie le résultat de l'écriture avant de l'écrire, pas après.
   */
  private async projectShares(
    projectId: string,
    holderId: string,
    newShareBasisPoints: number,
  ): Promise<{ founderBasisPoints: number; totalBasisPoints: number }> {
    const [holders, events] = await Promise.all([
      this.prisma.equity_holders.findMany({ where: { project_id: projectId } }),
      this.prisma.equity_events.findMany({
        where: { project_id: projectId },
        orderBy: { occurred_at: 'asc' },
      }),
    ]);

    const table = buildCapTable(holders, events);
    let founderBasisPoints = 0;
    let totalBasisPoints = 0;

    for (const share of table.holders) {
      const value =
        share.holderId === holderId ? newShareBasisPoints : (share.shareBasisPoints ?? 0);
      totalBasisPoints += value;
      if (share.isFounder) founderBasisPoints += value;
    }

    return { founderBasisPoints, totalBasisPoints };
  }

  private async findHolderForOwner(userId: string, holderId: string) {
    const holder = await this.prisma.equity_holders.findFirst({ where: { id: holderId } });
    if (!holder) {
      throw new NotFoundException('Détenteur introuvable.');
    }
    await assertOwnsProject(this.prisma, userId, holder.project_id);
    return holder;
  }

  // ------------------------------------------------- rachat progressif

  /**
   * Les trois conditions de rachat du modèle économique, telles que le
   * porteur les a écrites, et où il en est.
   *
   * Lecture ouverte aux collaborateurs, comme le reste du financement :
   * savoir à quelles conditions le porteur reprendra ses parts fait partie
   * de ce qu'un collaborateur a besoin de comprendre.
   */
  async getBuybackProgress(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const objectives = await this.prisma.buyback_objectives.findMany({
      where: { project_id: projectId },
    });

    // Article 7 : on ne rend pas une indication sans dire ce qu'Ignitux
    // ne décide pas. Retirer l'avertissement fait échouer l'appel.
    await this.constitutionService.guard({
      kind: 'publish_guidance',
      module: 'rachat progressif',
      notice: BUYBACK_SCOPE_NOTICE,
    });

    return {
      notice: BUYBACK_SCOPE_NOTICE,
      ...buybackProgress(objectives),
    };
  }

  /**
   * Écrit — ou réécrit — ce qu'une condition veut dire pour ce projet.
   *
   * Réécrire une définition remet la condition à « non atteinte » : une
   * condition déclarée atteinte puis redéfinie porterait une déclaration
   * qui ne correspond plus à ce qui a été déclaré. C'est exactement la
   * réinterprétation après coup que ce dispositif existe pour empêcher.
   */
  async setBuybackObjective(
    userId: string,
    projectId: string,
    kind: BuybackCondition,
    definition: string,
  ) {
    await assertOwnsProject(this.prisma, userId, projectId);

    return this.prisma.buyback_objectives.upsert({
      where: { project_id_kind: { project_id: projectId, kind } },
      create: { project_id: projectId, kind, definition },
      update: { definition, reached_at: null, evidence: null },
    });
  }

  /**
   * Le porteur déclare qu'une condition est atteinte — ou revient sur sa
   * déclaration. Ignitux ne le déduit d'aucune donnée : il n'a aucun moyen
   * de savoir ce que « rentable » veut dire pour ce projet, puisque c'est
   * le porteur qui l'a écrit.
   */
  async declareBuybackObjective(
    userId: string,
    projectId: string,
    kind: BuybackCondition,
    reachedAt: string | null | undefined,
    evidence: string | undefined,
  ) {
    await assertOwnsProject(this.prisma, userId, projectId);

    const objective = await this.prisma.buyback_objectives.findUnique({
      where: { project_id_kind: { project_id: projectId, kind } },
    });
    if (!objective) {
      throw new BadRequestException(
        "Écris d'abord ce que cette condition veut dire pour ton projet : on ne peut pas " +
          "déclarer atteinte une condition qui n'a pas été définie.",
      );
    }

    return this.prisma.buyback_objectives.update({
      where: { id: objective.id },
      data: {
        reached_at: reachedAt ? new Date(reachedAt) : null,
        evidence: reachedAt ? (evidence ?? null) : null,
      },
    });
  }
}
