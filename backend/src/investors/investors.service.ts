import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  allocatePro,
  isMovementKind,
  portfolioTotals,
  signIsCoherent,
  splitDividend,
  validateDistribution,
  type Allocation,
  type DistributionShare,
  type MovementKind,
  type PortfolioTotals,
} from './distribution.js';

export const INVESTOR_KINDS = ['personne', 'societe', 'ignitux'] as const;
export type InvestorKind = (typeof INVESTOR_KINDS)[number];

export const FINANCED_PROJECT_STATUSES = [
  'ouvert',
  'finance',
  'en_remboursement',
  'solde',
  'arrete',
] as const;

export const PARTICIPATION_STATUSES = ['active', 'cedee', 'soldee'] as const;

export interface RegisterInvestorInput {
  displayName: string;
  kind?: string;
  note?: string;
}

export interface OpenFinancingInput {
  projectId: string;
  openedOn: Date;
  targetCents?: number;
  note?: string;
}

export interface RecordParticipationInput {
  investorId: string;
  investedCents: number;
  occurredOn: Date;
  shareBasisPointsGranted?: number;
  equityHolderId?: string;
  note?: string;
}

export interface DistributionInput {
  amountCents: number;
  occurredOn: Date;
  reference?: string;
  note?: string;
}

export interface DividendInput extends DistributionInput {
  /**
   * La part perpétuelle d'Ignitux s'applique-t-elle ? Le produit ne devine
   * pas : tous les projets financés ne sont pas entrés au capital selon le
   * modèle 51/49.
   */
  applyPerpetualShare: boolean;
}

export interface ProjectPortfolioLine {
  financedProjectId: string;
  /** null quand le projet d'origine a été supprimé : le registre lui survit. */
  projectId: string | null;
  projectTitle: string;
  status: string;
  participations: number;
  totals: PortfolioTotals;
}

export interface InvestorPortfolio {
  investorId: string;
  displayName: string;
  /** Tous projets confondus. */
  global: PortfolioTotals;
  /** Et le détail, projet par projet, sans jamais les additionner entre eux. */
  parProjet: ProjectPortfolioLine[];
}

export interface SeparationAudit {
  /** Mouvements dont la participation appartient à un autre projet. */
  crossProjectMovementIds: string[];
  /** Mouvements dont le signe contredit leur nature. */
  wrongSignMovementIds: string[];
  /** Corrections qui ne désignent aucun mouvement. */
  orphanCorrectionIds: string[];
  clean: boolean;
}

/**
 * LE MOTEUR D'INVESTISSEMENT — un investisseur traverse les projets,
 * son argent jamais.
 *
 * ── Ce qui manquait ─────────────────────────────────────────────────────
 *
 * Le produit savait suivre le capital d'UN projet. Un détenteur n'y était
 * qu'un nom : « Marie Dubois » sur le projet A et « Marie Dubois » sur le
 * projet B étaient deux lignes sans lien. Impossible de dire ce qu'une
 * personne avait investi en tout, ni ce qui lui était revenu.
 *
 * ── La règle tenue ──────────────────────────────────────────────────────
 *
 * Tout mouvement porte son projet **et** son investisseur, tous deux NOT
 * NULL. Un remboursement du projet A ne peut pas apparaître dans le projet
 * B : il faudrait écrire un mouvement dont le projet et la participation se
 * contredisent, ce que la règle constitutionnelle
 * `investissements-non-melanges` refuse et que `separationAudit()` relit
 * après coup.
 *
 * ── Ce qui ne s'efface pas ──────────────────────────────────────────────
 *
 * Rien. Il n'existe aucune méthode de suppression dans ce service, et aucune
 * route pour en appeler une. Une erreur se corrige par un mouvement de
 * correction qui désigne celui qu'il rectifie — même principe qu'un avoir en
 * facturation, et pour la même raison : un historique réécrivable ne prouve
 * rien.
 */
@Injectable()
export class InvestorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitution: ConstitutionService,
  ) {}

  // ── L'investisseur ──────────────────────────────────────────────────────

  async registerInvestor(userId: string, input: RegisterInvestorInput) {
    const kind = input.kind ?? 'personne';
    if (!(INVESTOR_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Type d'investisseur inconnu « ${kind} ».`);
    }
    // `ignitux` ne se déclare pas depuis un compte : c'est l'investisseur
    // institutionnel, créé par l'exploitant. Laisser quelqu'un s'enregistrer
    // sous ce type lui donnerait l'apparence d'Ignitux dans les registres.
    if (kind === 'ignitux') {
      throw new ForbiddenException(
        "Le type « ignitux » est réservé à l'investisseur institutionnel et ne se déclare pas depuis un compte.",
      );
    }

    const existing = await this.prisma.investors.findFirst({ where: { user_id: userId } });
    if (existing) {
      throw new BadRequestException('Tu es déjà enregistré comme investisseur.');
    }

    return this.prisma.investors.create({
      data: {
        user_id: userId,
        kind,
        display_name: input.displayName,
        note: input.note ?? null,
      },
    });
  }

  async myInvestor(userId: string) {
    const investor = await this.prisma.investors.findFirst({ where: { user_id: userId } });
    if (!investor) {
      throw new NotFoundException("Tu n'es pas encore enregistré comme investisseur.");
    }
    return investor;
  }

  // ── Le projet financé ───────────────────────────────────────────────────

  async openFinancing(ownerId: string, input: OpenFinancingInput) {
    await assertOwnsProject(this.prisma, ownerId, input.projectId);

    const projet = await this.prisma.projects.findUniqueOrThrow({
      where: { id: input.projectId },
      select: { title: true },
    });

    const already = await this.prisma.financed_projects.findUnique({
      where: { project_id: input.projectId },
    });
    if (already) {
      throw new BadRequestException('Ce projet est déjà ouvert au financement.');
    }
    if (input.targetCents !== undefined && (!Number.isInteger(input.targetCents) || input.targetCents <= 0)) {
      throw new BadRequestException('Une cible de levée se compte en centimes entiers positifs.');
    }

    return this.prisma.financed_projects.create({
      data: {
        project_id: input.projectId,
        // Recopié maintenant : le registre doit rester lisible le jour où le
        // projet n'existera plus. Même principe que `client_name` sur une
        // facture émise.
        project_title: projet.title,
        entrepreneur_user_id: ownerId,
        target_cents: input.targetCents ?? null,
        opened_on: input.openedOn,
        note: input.note ?? null,
      },
    });
  }

  /** Le registre d'un projet financé — réservé au porteur. */
  /**
   * Le registre financier d'un projet, trouvé par l'identifiant du PROJET.
   *
   * Sans cela, l'écran de financement d'un projet ne peut pas s'ouvrir : il
   * connaît le projet, pas le registre. Rend `financedProject: null` quand le
   * projet n'a jamais été ouvert au financement — ce n'est pas une erreur,
   * c'est l'état normal de la plupart des projets, et un 404 obligerait
   * l'écran à traiter une absence banale comme une panne.
   */
  async projectRegisterByProject(ownerId: string, projectId: string) {
    const projet = await this.prisma.projects.findFirst({
      where: { id: projectId, owner_id: ownerId },
      select: { id: true },
    });
    if (!projet) throw new NotFoundException('Projet introuvable.');

    const financed = await this.prisma.financed_projects.findUnique({
      where: { project_id: projectId },
      select: { id: true },
    });
    if (!financed) {
      return {
        financedProject: null,
        raisedCents: 0,
        participations: [],
        movements: [],
        totals: portfolioTotals([]),
      };
    }

    return this.projectRegister(ownerId, financed.id);
  }

  async projectRegister(ownerId: string, financedProjectId: string) {
    const financed = await this.requireOwnedFinancedProject(ownerId, financedProjectId);

    const [participations, movements] = await Promise.all([
      this.prisma.participations.findMany({
        where: { financed_project_id: financedProjectId },
        include: { investor: true },
        orderBy: { occurred_on: 'asc' },
      }),
      this.prisma.investor_movements.findMany({
        where: { financed_project_id: financedProjectId },
        orderBy: [{ occurred_on: 'asc' }, { created_at: 'asc' }],
      }),
    ]);

    return {
      financedProject: financed,
      raisedCents: participations.reduce((total, p) => total + p.invested_cents, 0),
      participations,
      movements,
      totals: portfolioTotals(movements),
    };
  }

  // ── Les participations ──────────────────────────────────────────────────

  async recordParticipation(
    ownerId: string,
    financedProjectId: string,
    input: RecordParticipationInput,
  ) {
    const financed = await this.requireOwnedFinancedProject(ownerId, financedProjectId);

    if (!Number.isInteger(input.investedCents) || input.investedCents <= 0) {
      throw new BadRequestException('Un investissement se compte en centimes entiers positifs.');
    }
    if (
      input.shareBasisPointsGranted !== undefined &&
      (!Number.isInteger(input.shareBasisPointsGranted) ||
        input.shareBasisPointsGranted < 0 ||
        input.shareBasisPointsGranted > 10000)
    ) {
      throw new BadRequestException('Une part accordée va de 0 à 10000 points de base.');
    }

    const investor = await this.prisma.investors.findUnique({ where: { id: input.investorId } });
    if (!investor) throw new NotFoundException('Investisseur introuvable.');

    // Le détenteur lié, s'il y en a un, doit appartenir au MÊME projet :
    // rattacher la participation d'un projet au capital d'un autre ferait
    // calculer les versements sur la mauvaise table.
    if (input.equityHolderId) {
      const holder = await this.prisma.equity_holders.findUnique({
        where: { id: input.equityHolderId },
      });
      if (!holder || holder.project_id !== financed.project_id) {
        throw new BadRequestException(
          "Ce détenteur de parts n'appartient pas à ce projet.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const participation = await tx.participations.create({
        data: {
          investor_id: input.investorId,
          financed_project_id: financedProjectId,
          invested_cents: input.investedCents,
          share_basis_points_granted: input.shareBasisPointsGranted ?? null,
          equity_holder_id: input.equityHolderId ?? null,
          occurred_on: input.occurredOn,
          note: input.note ?? null,
        },
      });

      // L'apport entre au journal dans la même transaction : une
      // participation sans son mouvement serait de l'argent placé dont le
      // portefeuille ne dirait rien.
      await tx.investor_movements.create({
        data: {
          financed_project_id: financedProjectId,
          investor_id: input.investorId,
          participation_id: participation.id,
          kind: 'investissement',
          // Négatif : du point de vue de l'investisseur, l'argent sort.
          amount_cents: -input.investedCents,
          occurred_on: input.occurredOn,
          note: input.note ?? null,
        },
      });

      return participation;
    });
  }

  // ── Les versements ──────────────────────────────────────────────────────

  /** Remboursement de capital, réparti au prorata des montants investis. */
  distributeRepayment(ownerId: string, financedProjectId: string, input: DistributionInput) {
    return this.distribute(ownerId, financedProjectId, input, 'remboursement_capital', false);
  }

  /** Versement de dividendes, part perpétuelle d'Ignitux prélevée d'abord. */
  distributeDividend(ownerId: string, financedProjectId: string, input: DividendInput) {
    return this.distribute(ownerId, financedProjectId, input, 'dividende', input.applyPerpetualShare);
  }

  /** Versement de gains, réparti comme un remboursement. */
  distributeGain(ownerId: string, financedProjectId: string, input: DistributionInput) {
    return this.distribute(ownerId, financedProjectId, input, 'gain', false);
  }

  /**
   * Le cœur : un versement validé devient des mouvements, sans geste manuel.
   *
   * Tout se passe dans une seule transaction. Un versement à moitié réparti
   * serait pire que pas de versement du tout : une partie des investisseurs
   * crédités, l'autre non, et rien pour dire où le partage s'est arrêté.
   */
  private async distribute(
    ownerId: string,
    financedProjectId: string,
    input: DistributionInput,
    kind: MovementKind,
    applyPerpetualShare: boolean,
  ) {
    const financed = await this.requireOwnedFinancedProject(ownerId, financedProjectId);

    const participations = await this.prisma.participations.findMany({
      where: { financed_project_id: financedProjectId, status: 'active' },
    });

    const shares: DistributionShare[] = participations.map((p) => ({
      participationId: p.id,
      investorId: p.investor_id,
      weightCents: p.invested_cents,
    }));

    const problems = validateDistribution(input.amountCents, shares);
    if (problems.length > 0) {
      throw new BadRequestException(problems.map((p) => p.message).join(' '));
    }

    let allocations: Allocation[];
    let ignituxCents = 0;
    if (kind === 'dividende') {
      const split = splitDividend(input.amountCents, shares, applyPerpetualShare);
      allocations = split.allocations;
      ignituxCents = split.ignituxCents;
    } else {
      allocations = allocatePro(input.amountCents, shares);
    }

    // Le garde-fou constitutionnel, une fois par mouvement : chaque
    // allocation vise une participation, et cette participation doit
    // appartenir au projet qu'on rembourse.
    const projetDeParticipation = new Map(participations.map((p) => [p.id, p.financed_project_id]));
    for (const allocation of allocations) {
      await this.constitution.guard(
        {
          kind: 'record_investor_movement',
          movementProject: financedProjectId,
          participationProject: projetDeParticipation.get(allocation.participationId) ?? null,
        },
        { projectId: financed.project_id },
      );
    }

    // Un identifiant commun : un versement unique doit rester lisible comme
    // un seul geste, même éclaté en dix mouvements.
    const distributionId = randomUUID();

    // Le détenteur de parts correspondant à chaque participation, quand il y
    // en a un. C'est lui qui permet de tenir à jour la vue « par détenteur »
    // sans en faire une seconde vérité.
    const detenteurParParticipation = new Map(
      participations
        .filter((p) => p.equity_holder_id !== null)
        .map((p) => [p.id, p.equity_holder_id as string]),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const allocation of allocations) {
        if (allocation.amountCents <= 0) continue;

        const mouvement = await tx.investor_movements.create({
          data: {
            financed_project_id: financedProjectId,
            investor_id: allocation.investorId,
            participation_id: allocation.participationId,
            kind,
            amount_cents: allocation.amountCents,
            occurred_on: input.occurredOn,
            reference: input.reference ?? null,
            note: input.note ?? null,
            distribution_id: distributionId,
          },
        });

        // ── La consolidation des deux vues du dividende ────────────────
        //
        // Deux tables enregistrent un dividende : `dividend_distributions`
        // par détenteur de parts, `investor_movements` par investisseur.
        // Elles répondent à deux questions différentes et aucune ne peut
        // remplacer l'autre — un détenteur n'est pas toujours un
        // investisseur enregistré, et un investisseur n'est pas toujours au
        // capital.
        //
        // Ce ne sont pas pour autant deux vérités concurrentes : depuis
        // ici, **une seule voie d'écriture** alimente les deux, dans la
        // même transaction, et pose le lien entre elles. La vue par
        // détenteur devient une projection, plus une saisie parallèle qui
        // dérive en silence.
        const detenteur = detenteurParParticipation.get(allocation.participationId);
        if (kind === 'dividende' && detenteur && financed.project_id) {
          await tx.dividend_distributions.create({
            data: {
              project_id: financed.project_id,
              holder_id: detenteur,
              amount_cents: allocation.amountCents,
              occurred_at: input.occurredOn,
              note: input.note ?? null,
              investor_movement_id: mouvement.id,
            },
          });
        }
      }
    });

    return {
      distributionId,
      kind,
      amountCents: input.amountCents,
      /** Retenu au titre des 5 % perpétuels. Pas encore versé : voir plus bas. */
      ignituxCents,
      distributedCents: allocations.reduce((total, a) => total + a.amountCents, 0),
      allocations,
      /**
       * Ce que ce versement NE fait pas, et qu'il ne faut pas croire fait :
       * aucun euro ne bouge. Le produit enregistre une répartition, il
       * n'émet aucun virement — aucun fournisseur bancaire n'est branché.
       */
      notice:
        "Cette répartition est enregistrée, pas exécutée : Ignitux n'émet aucun virement. " +
        'Les montants ci-dessus disent ce qui revient à chacun, à verser par tes propres moyens.',
    };
  }

  /**
   * Corrige un mouvement. La seule façon d'annuler quoi que ce soit.
   *
   * Le mouvement d'origine reste. Ce n'est pas une précaution : un
   * historique qu'on peut réécrire ne prouve rien, et c'est précisément ce
   * qu'on demande à un registre d'investissement.
   */
  async correctMovement(
    ownerId: string,
    movementId: string,
    input: { amountCents: number; occurredOn: Date; note: string },
  ) {
    const original = await this.prisma.investor_movements.findUnique({
      where: { id: movementId },
      include: { financed_project: true },
    });
    if (!original) throw new NotFoundException('Mouvement introuvable.');

    await this.requireOwnedFinancedProject(ownerId, original.financed_project_id);

    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
      throw new BadRequestException('Une correction porte un montant entier non nul.');
    }
    if (!input.note.trim()) {
      // Une correction sans motif est une réécriture déguisée : six mois
      // plus tard, personne ne saura pourquoi le montant a changé.
      throw new BadRequestException('Une correction doit dire pourquoi.');
    }
    if (original.kind === 'correction') {
      throw new BadRequestException(
        'On ne corrige pas une correction : corrige le mouvement d’origine.',
      );
    }

    return this.prisma.investor_movements.create({
      data: {
        financed_project_id: original.financed_project_id,
        investor_id: original.investor_id,
        participation_id: original.participation_id,
        kind: 'correction',
        amount_cents: input.amountCents,
        occurred_on: input.occurredOn,
        note: input.note,
        corrects_movement_id: original.id,
      },
    });
  }

  // ── Le portefeuille ─────────────────────────────────────────────────────

  /**
   * Le portefeuille d'un investisseur : une vue globale, et le détail projet
   * par projet.
   *
   * Les deux coexistent sans se contredire, parce que le global est la somme
   * des lignes et non un chiffre calculé à part. Un total qui se calcule deux
   * fois finit par donner deux réponses.
   */
  async portfolio(investorId: string): Promise<InvestorPortfolio> {
    const investor = await this.prisma.investors.findUnique({ where: { id: investorId } });
    if (!investor) throw new NotFoundException('Investisseur introuvable.');

    const movements = await this.prisma.investor_movements.findMany({
      where: { investor_id: investorId },
      orderBy: [{ occurred_on: 'asc' }, { created_at: 'asc' }],
    });

    const financedIds = [...new Set(movements.map((m) => m.financed_project_id))];
    const projets = await this.prisma.financed_projects.findMany({
      where: { id: { in: financedIds } },
    });
    const participations = await this.prisma.participations.findMany({
      where: { investor_id: investorId },
      select: { financed_project_id: true },
    });

    const parProjet: ProjectPortfolioLine[] = projets.map((projet) => {
      // Chaque projet totalise ses propres mouvements. C'est ce filtre, et
      // lui seul, qui empêche les projets de se mélanger dans la lecture —
      // le stockage les sépare déjà, mais une lecture négligente les
      // rassemblerait quand même.
      const siens = movements.filter((m) => m.financed_project_id === projet.id);
      return {
        financedProjectId: projet.id,
        projectId: projet.project_id,
        // Le titre recopié, jamais celui du projet vivant : c'est ce qui
        // permet au registre de rester lisible après une suppression.
        projectTitle: projet.project_title,
        status: projet.status,
        participations: participations.filter((p) => p.financed_project_id === projet.id).length,
        totals: portfolioTotals(siens),
      };
    });

    return {
      investorId: investor.id,
      displayName: investor.display_name,
      global: portfolioTotals(movements),
      parProjet: parProjet.sort((a, b) => a.projectTitle.localeCompare(b.projectTitle)),
    };
  }

  /** L'historique d'un investisseur sur UN projet, et rien d'autre. */
  async projectHistory(investorId: string, financedProjectId: string) {
    const movements = await this.prisma.investor_movements.findMany({
      where: { investor_id: investorId, financed_project_id: financedProjectId },
      orderBy: [{ occurred_on: 'asc' }, { created_at: 'asc' }],
    });
    return { financedProjectId, movements, totals: portfolioTotals(movements) };
  }

  listParticipations(investorId: string) {
    return this.prisma.participations.findMany({
      where: { investor_id: investorId },
      include: { financed_project: { include: { project: { select: { title: true } } } } },
      orderBy: { occurred_on: 'desc' },
    });
  }

  async participationDetail(investorId: string, participationId: string) {
    const participation = await this.prisma.participations.findUnique({
      where: { id: participationId },
      include: { financed_project: { include: { project: { select: { title: true } } } } },
    });
    if (!participation) throw new NotFoundException('Participation introuvable.');
    if (participation.investor_id !== investorId) {
      throw new ForbiddenException("Cette participation n'est pas la tienne.");
    }

    const movements = await this.prisma.investor_movements.findMany({
      where: { participation_id: participationId },
      orderBy: [{ occurred_on: 'asc' }, { created_at: 'asc' }],
    });

    return { participation, movements, totals: portfolioTotals(movements) };
  }

  // ── Le contrôle ─────────────────────────────────────────────────────────

  /**
   * Relit tout le registre et cherche les trois défauts qui rendraient la
   * séparation fausse. En SQL : un contrôle qui chargerait tout en mémoire
   * cesserait de tourner le jour où il y aurait de quoi contrôler.
   */
  async separationAudit(): Promise<SeparationAudit> {
    const croises = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id
      FROM investor_movements m
      JOIN participations p ON p.id = m.participation_id
      WHERE p.financed_project_id <> m.financed_project_id
    `;

    const signes = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM investor_movements
      WHERE (kind = 'investissement' AND amount_cents >= 0)
         OR (kind IN ('remboursement_capital', 'dividende', 'gain') AND amount_cents <= 0)
         OR (kind = 'correction' AND amount_cents = 0)
    `;

    const orphelines = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c.id
      FROM investor_movements c
      LEFT JOIN investor_movements o ON o.id = c.corrects_movement_id
      WHERE c.kind = 'correction' AND (c.corrects_movement_id IS NULL OR o.id IS NULL)
    `;

    const crossProjectMovementIds = croises.map((r) => r.id);
    const wrongSignMovementIds = signes.map((r) => r.id);
    const orphanCorrectionIds = orphelines.map((r) => r.id);

    return {
      crossProjectMovementIds,
      wrongSignMovementIds,
      orphanCorrectionIds,
      clean:
        crossProjectMovementIds.length === 0 &&
        wrongSignMovementIds.length === 0 &&
        orphanCorrectionIds.length === 0,
    };
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private async requireOwnedFinancedProject(ownerId: string, financedProjectId: string) {
    const financed = await this.prisma.financed_projects.findUnique({
      where: { id: financedProjectId },
    });
    if (!financed) throw new NotFoundException('Projet financé introuvable.');

    // Un registre détaché de son projet n'a plus de propriétaire vivant :
    // personne ne peut plus y écrire. Il reste consultable par les
    // investisseurs qui y figurent, et c'est tout — le porteur est parti,
    // ses droits avec lui.
    if (!financed.project_id) {
      throw new NotFoundException(
        "Ce registre n'est plus rattaché à un projet : il se consulte, il ne se modifie plus.",
      );
    }

    // On repasse par le contrôle de propriété du projet plutôt que de se
    // fier à `entrepreneur_user_id` recopié ici : une colonne dénormalisée
    // est une vérité de plus à maintenir, et celle-ci ne doit jamais servir
    // de garde.
    await assertOwnsProject(this.prisma, ownerId, financed.project_id);
    return { ...financed, project_id: financed.project_id };
  }
}

export { isMovementKind, signIsCoherent };
