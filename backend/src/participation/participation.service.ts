import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { buildCapTable } from '../financing/financing-model.js';
import { estOffre, offre } from '../offres/offres-catalogue.js';
import { assertHasProjectAccess } from '../prisma/assert-has-project-access.js';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { estOperateurIgnitux } from './operateurs.js';
import {
  DEFAULT_DIVIDEND_RIGHT_BASIS_POINTS,
  DEFAULT_ECOSYSTEM_OFFRE,
  DEFAULT_ENTRY_SPLIT,
  dividendRightDueCents,
  participationPhase,
  TOTAL_BASIS_POINTS,
  validateAgreementTerms,
  validateMilestoneTarget,
  type ParticipationProblem,
} from './participation-model.js';

export const IGNITUX_HOLDER_NAME = 'IGNITUX';

/** Qui agit. Ce qui compte est l'adresse : voir `operateurs.ts`. */
export interface Actor {
  id: string;
  email: string;
}

export interface CreateAgreementInput {
  founderName: string;
  effectiveOn: Date;
  founderBasisPoints?: number;
  ignituxBasisPoints?: number;
  dividendRightBasisPoints?: number;
  ecosystemOffre?: string;
  contractReference?: string;
}

export interface AddMilestoneInput {
  label?: string;
  targetIgnituxBasisPoints: number;
  conditions?: string[];
}

export interface RecordDividendInput {
  distributedCents: number;
  occurredOn: Date;
  note?: string;
}

export const PARTICIPATION_SCOPE_NOTICE =
  "La participation d'IGNITUX se lit en trois couches séparées : le capital (qui détient quelle " +
  "part), le droit économique (un pourcentage des dividendes réellement distribués, uniquement " +
  "une fois le capital entièrement transmis) et l'accès à l'écosystème IGNITUX (défini par " +
  "l'accord). Aucun palier ne se déclenche avec le temps : chacun est validé par IGNITUX quand " +
  "les conditions définies pour ce projet sont remplies. Ignitux n'émet aucun virement : le " +
  'registre dit ce qui est dû, il ne le prélève pas.';

/**
 * PARTICIPATION IGNITUX — l'accord, ses paliers et le droit sur les dividendes.
 *
 * Écrit AU-DESSUS du suivi du capital existant (`financing/`), jamais à sa
 * place : le capital reste dans `equity_holders` / `equity_events`, seule
 * autorité sur qui détient quelle part. Ce service ajoute ce qui n'existait
 * pas — un accord qui dit comment le capital doit évoluer et qui le valide —
 * et il écrit le capital par les mêmes tables.
 *
 * Qui peut quoi :
 *   - IGNITUX (opérateurs) : créer l'accord, prévoir / valider / exécuter un
 *     palier, régler un droit constaté ;
 *   - le porteur : lire, prendre connaissance d'un palier, constater un
 *     dividende distribué ;
 *   - les collaborateurs : lire.
 * La validation d'un palier ne revient jamais au porteur seul.
 */
@Injectable()
export class ParticipationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitution: ConstitutionService,
  ) {}

  // ----------------------------------------------------------------- accès

  private requireOperator(actor: Actor): void {
    if (!estOperateurIgnitux(actor.email)) {
      throw new ForbiddenException(
        "Cette action est réservée à IGNITUX : la validation d'un accord de participation ne " +
          "revient jamais à l'entrepreneur seul.",
      );
    }
  }

  private refuse(problems: ParticipationProblem[]): never {
    throw new BadRequestException(problems.map((problem) => problem.message).join(' '));
  }

  // ------------------------------------------------------------- l'accord

  async createAgreement(operator: Actor, projectId: string, input: CreateAgreementInput) {
    this.requireOperator(operator);

    const project = await this.prisma.projects.findFirst({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const terms = {
      founderBasisPoints: input.founderBasisPoints ?? DEFAULT_ENTRY_SPLIT.founderBasisPoints,
      ignituxBasisPoints: input.ignituxBasisPoints ?? DEFAULT_ENTRY_SPLIT.ignituxBasisPoints,
      dividendRightBasisPoints: input.dividendRightBasisPoints ?? DEFAULT_DIVIDEND_RIGHT_BASIS_POINTS,
    };
    const problems = validateAgreementTerms(terms);
    if (problems.length > 0) this.refuse(problems);

    const ecosystemOffre = input.ecosystemOffre ?? DEFAULT_ECOSYSTEM_OFFRE;
    if (!estOffre(ecosystemOffre)) {
      throw new BadRequestException(`L'offre « ${ecosystemOffre} » n'existe pas dans le catalogue.`);
    }

    if (await this.prisma.participation_agreements.findFirst({ where: { project_id: projectId } })) {
      throw new ConflictException('Ce projet a déjà un accord de participation.');
    }
    // Un capital saisi à la main n'a pas été pensé pour cet accord : y poser
    // deux détenteurs de plus produirait une répartition qui ne boucle plus.
    if ((await this.prisma.equity_holders.count({ where: { project_id: projectId } })) > 0) {
      throw new BadRequestException(
        "Ce projet a déjà une répartition du capital saisie à la main : elle est déjà là, un accord " +
          "ne peut pas la doubler. Reprends-la d'abord avec IGNITUX.",
      );
    }

    // Le même garde-fou que toute écriture du capital (art. 22).
    await this.constitution.guard(
      {
        kind: 'set_equity',
        holderName: input.founderName,
        isFounder: true,
        founderBasisPointsAfter: terms.founderBasisPoints,
        totalBasisPointsAfter: terms.founderBasisPoints + terms.ignituxBasisPoints,
      },
      { userId: operator.id, projectId },
    );

    return this.prisma.$transaction(async (tx) => {
      const founder = await tx.equity_holders.create({
        data: { project_id: projectId, name: input.founderName, is_founder: true },
      });
      const ignitux = await tx.equity_holders.create({
        data: { project_id: projectId, name: IGNITUX_HOLDER_NAME, is_founder: false },
      });

      const reason = 'Entrée au capital — accord de participation IGNITUX';
      await tx.equity_events.create({
        data: {
          project_id: projectId,
          holder_id: founder.id,
          share_basis_points: terms.founderBasisPoints,
          reason,
          occurred_at: input.effectiveOn,
        },
      });
      await tx.equity_events.create({
        data: {
          project_id: projectId,
          holder_id: ignitux.id,
          share_basis_points: terms.ignituxBasisPoints,
          reason,
          occurred_at: input.effectiveOn,
        },
      });

      return tx.participation_agreements.create({
        data: {
          project_id: projectId,
          founder_holder_id: founder.id,
          ignitux_holder_id: ignitux.id,
          initial_founder_bps: terms.founderBasisPoints,
          initial_ignitux_bps: terms.ignituxBasisPoints,
          dividend_right_bps: terms.dividendRightBasisPoints,
          effective_on: input.effectiveOn,
          contract_reference: input.contractReference ?? null,
          ecosystem_offre: ecosystemOffre,
        },
      });
    });
  }

  private async requireAgreement(projectId: string) {
    const agreement = await this.prisma.participation_agreements.findFirst({
      where: { project_id: projectId },
    });
    if (!agreement) throw new NotFoundException("Ce projet n'a pas d'accord de participation.");
    return agreement;
  }

  /** La part d'IGNITUX au capital aujourd'hui, lue dans les événements. */
  private async currentIgnituxBasisPoints(
    agreement: { project_id: string; ignitux_holder_id: string },
    client: Pick<PrismaService, 'equity_events'> = this.prisma,
  ): Promise<number | null> {
    const events = await client.equity_events.findMany({
      where: { project_id: agreement.project_id, holder_id: agreement.ignitux_holder_id },
    });
    if (events.length === 0) return null;
    const table = buildCapTable([{ id: agreement.ignitux_holder_id, name: IGNITUX_HOLDER_NAME, is_founder: false }], events);
    return table.holders[0]?.shareBasisPoints ?? null;
  }

  // -------------------------------------------------------------- paliers

  async addMilestone(operator: Actor, projectId: string, input: AddMilestoneInput) {
    this.requireOperator(operator);
    const agreement = await this.requireAgreement(projectId);
    if (agreement.status === 'clos') {
      throw new BadRequestException("Cet accord est clos : on n'y ajoute plus de palier.");
    }

    const [current, existing] = await Promise.all([
      this.currentIgnituxBasisPoints(agreement),
      this.prisma.participation_milestones.findMany({
        where: { agreement_id: agreement.id },
        orderBy: { position: 'asc' },
      }),
    ]);
    if (current === null) {
      throw new BadRequestException("Le capital d'IGNITUX n'est pas connu pour ce projet.");
    }

    // La référence est la part visée par le dernier palier encore devant
    // nous, sinon la part actuelle : la part d'IGNITUX ne fait que baisser.
    const active = existing.filter((milestone) => milestone.status !== 'abandonne');
    const reference = active.length > 0 ? active[active.length - 1].target_ignitux_bps : current;
    const problems = validateMilestoneTarget(reference, input.targetIgnituxBasisPoints);
    if (problems.length > 0) this.refuse(problems);

    const position = existing.length > 0 ? existing[existing.length - 1].position + 1 : 1;
    return this.prisma.participation_milestones.create({
      data: {
        agreement_id: agreement.id,
        position,
        label: input.label ?? null,
        target_ignitux_bps: input.targetIgnituxBasisPoints,
        conditions: (input.conditions ?? []).map((c) => c.trim()).filter((c) => c.length > 0),
      },
    });
  }

  private async requireMilestone(milestoneId: string) {
    const milestone = await this.prisma.participation_milestones.findFirst({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException('Palier introuvable.');
    const agreement = await this.prisma.participation_agreements.findFirst({
      where: { id: milestone.agreement_id },
    });
    if (!agreement) throw new NotFoundException('Palier introuvable.');
    return { milestone, agreement };
  }

  /** Tous les paliers avant celui-ci sont-ils réglés (exécutés ou abandonnés) ? */
  private async previousMilestonesSettled(agreementId: string, position: number): Promise<boolean> {
    const all = await this.prisma.participation_milestones.findMany({ where: { agreement_id: agreementId } });
    return all
      .filter((candidate) => candidate.position < position)
      .every((candidate) => candidate.status === 'execute' || candidate.status === 'abandonne');
  }

  async validateMilestone(operator: Actor, milestoneId: string, note?: string) {
    this.requireOperator(operator);
    const { milestone, agreement } = await this.requireMilestone(milestoneId);

    if (milestone.status !== 'prevu') {
      throw new BadRequestException(`Ce palier est déjà « ${milestone.status} » : il ne se valide qu'une fois.`);
    }
    if (milestone.conditions.length === 0) {
      // Valider, c'est constater que des conditions sont remplies. Sans
      // condition écrite, il n'y a rien à constater — et IGNITUX n'en invente
      // pas à la place du projet.
      throw new BadRequestException(
        "Ce palier n'a aucune condition définie : il n'y a rien à constater. Définis d'abord ses " +
          'conditions pour ce projet.',
      );
    }
    if (!(await this.previousMilestonesSettled(agreement.id, milestone.position))) {
      throw new BadRequestException("Le palier précédent n'est pas encore exécuté.");
    }

    return this.prisma.participation_milestones.update({
      where: { id: milestone.id },
      data: {
        status: 'valide',
        validated_at: new Date(),
        validated_by: operator.id,
        validation_note: note ?? null,
      },
    });
  }

  /**
   * Le porteur prend connaissance d'un palier. Cela ne valide rien et ne
   * remplace jamais la validation d'IGNITUX : seul `founder_acknowledged_at`
   * bouge.
   */
  async acknowledgeMilestone(userId: string, milestoneId: string) {
    const { milestone, agreement } = await this.requireMilestone(milestoneId);
    await assertOwnsProject(this.prisma, userId, agreement.project_id);

    return this.prisma.participation_milestones.update({
      where: { id: milestone.id },
      data: { founder_acknowledged_at: new Date() },
    });
  }

  async executeMilestone(operator: Actor, milestoneId: string, effectiveOn: Date) {
    this.requireOperator(operator);
    const { milestone, agreement } = await this.requireMilestone(milestoneId);

    if (milestone.status !== 'valide') {
      throw new BadRequestException(
        milestone.status === 'execute'
          ? 'Ce palier est déjà exécuté.'
          : "Ce palier n'est pas validé par IGNITUX : il ne peut pas être exécuté.",
      );
    }
    if (!(await this.previousMilestonesSettled(agreement.id, milestone.position))) {
      throw new BadRequestException("Le palier précédent n'est pas encore exécuté.");
    }

    const before = await this.currentIgnituxBasisPoints(agreement);
    if (before === null) {
      throw new BadRequestException("Le capital d'IGNITUX n'est pas connu pour ce projet.");
    }
    const after = milestone.target_ignitux_bps;
    const founderAfter = TOTAL_BASIS_POINTS - after;

    await this.constitution.guard(
      {
        kind: 'execute_participation_milestone',
        ignituxBasisPointsBefore: before,
        ignituxBasisPointsAfter: after,
        founderBasisPointsAfter: founderAfter,
      },
      { userId: operator.id, projectId: agreement.project_id },
    );

    return this.prisma.$transaction(async (tx) => {
      const reason = `Palier ${milestone.position}${milestone.label ? ` — ${milestone.label}` : ''}`;
      const founderEvent = await tx.equity_events.create({
        data: {
          project_id: agreement.project_id,
          holder_id: agreement.founder_holder_id,
          share_basis_points: founderAfter,
          reason,
          occurred_at: effectiveOn,
        },
      });
      const ignituxEvent = await tx.equity_events.create({
        data: {
          project_id: agreement.project_id,
          holder_id: agreement.ignitux_holder_id,
          share_basis_points: after,
          reason,
          occurred_at: effectiveOn,
        },
      });

      if (after === 0) {
        await tx.participation_agreements.update({
          where: { id: agreement.id },
          data: { status: 'transmis', transmitted_on: effectiveOn },
        });
      }

      return tx.participation_milestones.update({
        where: { id: milestone.id },
        data: {
          status: 'execute',
          effective_on: effectiveOn,
          executed_at: new Date(),
          equity_event_ids: [founderEvent.id, ignituxEvent.id],
        },
      });
    });
  }

  // ------------------------------------------------- droit sur les dividendes

  /**
   * Constate un dividende effectivement distribué et ce qu'il doit à IGNITUX.
   *
   * Le droit n'existe qu'à 0 % du capital (règle constitutionnelle) : avant,
   * IGNITUX est payé par sa part de capital, sans rien en plus. Un dividende
   * nul ne produit aucune ligne.
   */
  async recordDistributedDividend(userId: string, projectId: string, input: RecordDividendInput) {
    await assertOwnsProject(this.prisma, userId, projectId);
    const agreement = await this.requireAgreement(projectId);

    if (!Number.isInteger(input.distributedCents) || input.distributedCents <= 0) {
      throw new BadRequestException(
        "Un dividende distribué porte un montant entier strictement positif : sans dividende, " +
          "aucun droit n'est dû.",
      );
    }

    await this.constitution.guard(
      {
        kind: 'record_dividend_right',
        ignituxCapitalBasisPoints: await this.currentIgnituxBasisPoints(agreement),
      },
      { userId, projectId },
    );

    return this.prisma.dividend_right_entries.create({
      data: {
        agreement_id: agreement.id,
        distributed_cents: input.distributedCents,
        right_bps: agreement.dividend_right_bps,
        due_cents: dividendRightDueCents(input.distributedCents, agreement.dividend_right_bps),
        occurred_on: input.occurredOn,
        note: input.note ?? null,
      },
    });
  }

  async settleDividendRight(operator: Actor, entryId: string, settledOn: Date) {
    this.requireOperator(operator);
    const entry = await this.prisma.dividend_right_entries.findFirst({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Ligne introuvable.');
    if (entry.status === 'regle') {
      throw new BadRequestException('Cette ligne est déjà réglée.');
    }

    return this.prisma.dividend_right_entries.update({
      where: { id: entry.id },
      data: { status: 'regle', settled_on: settledOn },
    });
  }

  // ---------------------------------------------------------------- lecture

  async getParticipation(userId: string, projectId: string) {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const agreement = await this.prisma.participation_agreements.findFirst({
      where: { project_id: projectId },
    });
    if (!agreement) return { agreement: null };

    const [holders, events, milestones, entries] = await Promise.all([
      this.prisma.equity_holders.findMany({
        where: { project_id: projectId },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.equity_events.findMany({
        where: { project_id: projectId },
        orderBy: { occurred_at: 'asc' },
      }),
      this.prisma.participation_milestones.findMany({
        where: { agreement_id: agreement.id },
        orderBy: { position: 'asc' },
      }),
      this.prisma.dividend_right_entries.findMany({
        where: { agreement_id: agreement.id },
        orderBy: { occurred_on: 'desc' },
      }),
    ]);

    const agreementHolderIds = new Set([agreement.founder_holder_id, agreement.ignitux_holder_id]);
    const agreementHolders = holders.filter((holder) => agreementHolderIds.has(holder.id));
    const agreementEvents = events.filter((event) => agreementHolderIds.has(event.holder_id));
    const capital = buildCapTable(agreementHolders, agreementEvents);
    const ignituxShare = capital.holders.find((holder) => !holder.isFounder)?.shareBasisPoints ?? null;
    const phase = participationPhase(ignituxShare);
    const holderName = new Map(holders.map((holder) => [holder.id, holder.name]));

    const totalDueCents = entries.reduce((total, entry) => total + entry.due_cents, 0);
    const totalSettledCents = entries
      .filter((entry) => entry.status === 'regle')
      .reduce((total, entry) => total + entry.due_cents, 0);

    return {
      agreement,
      notice: PARTICIPATION_SCOPE_NOTICE,
      phase,
      // COUCHE 1 — le capital.
      capital,
      history: agreementEvents.map((event) => ({
        holderName: holderName.get(event.holder_id) ?? '',
        shareBasisPoints: event.share_basis_points,
        reason: event.reason,
        occurredAt: event.occurred_at,
      })),
      milestones,
      // COUCHE 2 — le droit économique. Jamais une part de capital.
      dividendRight: {
        rightBasisPoints: agreement.dividend_right_bps,
        active: phase === 'transmise',
        entries,
        totalDueCents,
        totalSettledCents,
      },
      // COUCHE 3 — l'accès à l'écosystème, défini par l'accord.
      ecosystem: {
        offre: agreement.ecosystem_offre,
        label: estOffre(agreement.ecosystem_offre) ? offre(agreement.ecosystem_offre).label : agreement.ecosystem_offre,
        active: agreement.status !== 'clos',
      },
    };
  }
}
