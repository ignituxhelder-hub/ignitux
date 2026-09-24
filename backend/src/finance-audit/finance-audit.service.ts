import { Injectable } from '@nestjs/common';
import { InvestorsService } from '../investors/investors.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { assertHasProjectAccess } from '../prisma/assert-has-project-access.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Un contrôle, et ce qu'il a trouvé.
 *
 * `count` vaut zéro la plupart du temps, et c'est justement pour ça que la
 * ligne est là : un audit qui ne montre que les défauts ne dit pas ce qu'il
 * a regardé. On ne saurait pas distinguer « tout va bien » de « ce contrôle
 * n'existe pas ».
 */
export interface AuditFinding {
  code: string;
  /** Ce que le contrôle cherche, en une phrase lisible. */
  label: string;
  /** Pourquoi c'est un défaut, et pas une bizarrerie sans conséquence. */
  why: string;
  count: number;
  /** Quelques identifiants concernés, pour aller voir. Jamais la liste entière. */
  sample: string[];
}

export interface FinanceAudit {
  checkedAt: Date;
  findings: AuditFinding[];
  clean: boolean;
}

/**
 * L'AUDIT GLOBAL DU MODULE FINANCIER.
 *
 * ── Pourquoi un audit en plus des tests ─────────────────────────────────
 *
 * Les tests disent que le code refuse ce qu'il doit refuser **au moment où
 * il écrit**. Ils ne disent rien de l'état de la base : une migration
 * bâclée, un script lancé à la main, une version antérieure du code, un
 * import de données — rien de tout cela ne passe par les contrôles
 * d'écriture, et rien de tout cela n'est hypothétique.
 *
 * Cet audit relit **ce qui est réellement là**, en SQL, et il est conçu pour
 * rester utilisable quand la base sera pleine : aucun chargement en mémoire.
 *
 * ── Il n'y a aucune route pour l'audit global ───────────────────────────
 *
 * Il parcourt toute la base : les livres d'Ignitux, les registres de tous
 * les porteurs, les participations de tous les investisseurs. Le publier
 * derrière une simple authentification donnerait à n'importe quel compte une
 * vue sur l'activité de tout le monde. Il demande un rôle d'exploitant qui
 * n'existe pas encore — même réponse que pour le total des coûts IA et les
 * livres d'Ignitux. En attendant, il se lance depuis la console.
 *
 * Ce qui EST exposé, c'est `projectAudit` : la cohérence financière d'un
 * projet, rendue à qui a le droit de le lire.
 */
@Injectable()
export class FinanceAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly investors: InvestorsService,
  ) {}

  /** Tout le module financier, relu ligne à ligne. Sans route — voir plus haut. */
  async globalAudit(): Promise<FinanceAudit> {
    const [grandLivre, investisseurs] = await Promise.all([
      this.ledger.separationAudit(),
      this.investors.separationAudit(),
    ]);

    const findings: AuditFinding[] = [
      {
        code: 'ecriture-a-cheval',
        label: 'Écritures comptables touchant le compte d’un autre propriétaire',
        why:
          "Une écriture pareille est parfaitement équilibrée : elle ferait passer de l'argent " +
          "d'une comptabilité à l'autre sans qu'aucun contrôle comptable ne bronche.",
        count: grandLivre.mixedEntryIds.length,
        sample: grandLivre.mixedEntryIds.slice(0, 5),
      },
      {
        code: 'ecriture-desequilibree',
        label: 'Écritures dont les débits ne couvrent pas les crédits',
        why: 'Une comptabilité en partie double équilibre toujours. Sinon, un montant manque.',
        count: grandLivre.unbalancedEntryIds.length,
        sample: grandLivre.unbalancedEntryIds.slice(0, 5),
      },
      {
        code: 'contrepartie-muette',
        label: 'Écritures désignant une contrepartie qui ne les désigne pas en retour',
        why:
          'Un virement entre deux comptabilités est fait de deux écritures jumelles. Si une seule ' +
          "pointe vers l'autre, l'argent apparaît d'un côté sans disparaître de l'autre.",
        count: grandLivre.danglingCounterpartIds.length,
        sample: grandLivre.danglingCounterpartIds.slice(0, 5),
      },
      {
        code: 'mouvement-inter-projets',
        label: 'Mouvements d’investisseur attribués à un projet mais visant la participation d’un autre',
        why: 'Un remboursement du projet A apparaîtrait dans le registre du projet B.',
        count: investisseurs.crossProjectMovementIds.length,
        sample: investisseurs.crossProjectMovementIds.slice(0, 5),
      },
      {
        code: 'signe-incoherent',
        label: 'Mouvements dont le signe contredit leur nature',
        why:
          'Un investissement positif ou un remboursement négatif fausse tous les totaux du ' +
          'portefeuille, sans rien casser visiblement.',
        count: investisseurs.wrongSignMovementIds.length,
        sample: investisseurs.wrongSignMovementIds.slice(0, 5),
      },
      {
        code: 'correction-orpheline',
        label: 'Corrections qui ne désignent aucun mouvement',
        why:
          'Une correction se rattache au poste du mouvement qu’elle rectifie. Sans cible, elle ' +
          'flotte hors de tout poste et le total cesse de décrire la réalité.',
        count: investisseurs.orphanCorrectionIds.length,
        sample: investisseurs.orphanCorrectionIds.slice(0, 5),
      },
      ...(await this.capTableFindings()),
      ...(await this.dividendFindings()),
      ...(await this.billingFindings()),
    ];

    return {
      checkedAt: new Date(),
      findings,
      clean: findings.every((f) => f.count === 0),
    };
  }

  /** La cohérence financière d’UN projet, rendue à qui a le droit de le lire. */
  async projectAudit(userId: string, projectId: string): Promise<FinanceAudit> {
    await assertHasProjectAccess(this.prisma, userId, projectId);

    const [capTable, dividendes] = await Promise.all([
      this.capTableFindings(projectId),
      this.dividendFindings(projectId),
    ]);

    const findings = [...capTable, ...dividendes];
    return {
      checkedAt: new Date(),
      findings,
      clean: findings.every((f) => f.count === 0),
    };
  }

  // ── Les contrôles ───────────────────────────────────────────────────────

  /**
   * Répartitions du capital qui ne bouclent pas à 100 %.
   *
   * Le produit **autorise** cet état pendant la saisie — on ne peut pas
   * répartir ligne par ligne autrement — et il le signale déjà dans la table
   * de capitalisation (`discrepancyBasisPoints`). Ce qu'il ne dit nulle part,
   * c'est **combien de projets** sont restés dans cet état. Or tant qu'une
   * répartition ne boucle pas, la garantie des 51 % ne se prononce pas :
   * `founderHasMajority` vaut `null`, et la protection du porteur est donc
   * en sommeil sans que personne ne l'ait décidé.
   */
  private async capTableFindings(projectId?: string): Promise<AuditFinding[]> {
    const lignes = projectId
      ? await this.prisma.$queryRaw<Array<{ project_id: string }>>`
          SELECT dernier.project_id
          FROM (
            SELECT DISTINCT ON (e.holder_id) e.project_id, e.share_basis_points
            FROM equity_events e
            WHERE e.project_id = ${projectId}::uuid
            ORDER BY e.holder_id, e.occurred_at DESC, e.created_at DESC
          ) dernier
          GROUP BY dernier.project_id
          HAVING SUM(dernier.share_basis_points) <> 10000
        `
      : await this.prisma.$queryRaw<Array<{ project_id: string }>>`
          SELECT dernier.project_id
          FROM (
            SELECT DISTINCT ON (e.holder_id) e.project_id, e.share_basis_points
            FROM equity_events e
            ORDER BY e.holder_id, e.occurred_at DESC, e.created_at DESC
          ) dernier
          GROUP BY dernier.project_id
          HAVING SUM(dernier.share_basis_points) <> 10000
        `;

    return [
      {
        code: 'capital-incomplet',
        label: 'Projets dont la répartition du capital ne boucle pas à 100 %',
        why:
          'Tant qu’elle ne boucle pas, la garantie des 51 % ne se prononce pas : la protection ' +
          'du porteur est en sommeil sans que personne ne l’ait décidé.',
        count: lignes.length,
        sample: lignes.map((l) => l.project_id).slice(0, 5),
      },
    ];
  }

  /**
   * Les deux vues du dividende, confrontées.
   *
   * Depuis la consolidation, le moteur d'investissement écrit les deux dans
   * la même transaction. Ces contrôles attrapent ce que la transaction ne
   * peut pas couvrir : les lignes écrites avant elle, celles écrites à la
   * main en parallèle, et une éventuelle double projection d'un même
   * mouvement — l'unicité n'étant pas posée en base faute de pouvoir lancer
   * la migration qui l'exigerait.
   */
  private async dividendFindings(projectId?: string): Promise<AuditFinding[]> {
    const filtre = projectId ? projectId : null;

    const sansProjection = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id
      FROM investor_movements m
      JOIN participations p ON p.id = m.participation_id
      LEFT JOIN dividend_distributions d ON d.investor_movement_id = m.id
      JOIN financed_projects f ON f.id = m.financed_project_id
      WHERE m.kind = 'dividende'
        AND p.equity_holder_id IS NOT NULL
        AND d.id IS NULL
        AND (${filtre}::uuid IS NULL OR f.project_id = ${filtre}::uuid)
    `;

    const projectionSansMouvement = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT d.id
      FROM dividend_distributions d
      LEFT JOIN investor_movements m ON m.id = d.investor_movement_id
      WHERE d.investor_movement_id IS NOT NULL
        AND m.id IS NULL
        AND (${filtre}::uuid IS NULL OR d.project_id = ${filtre}::uuid)
    `;

    const doubleProjection = await this.prisma.$queryRaw<Array<{ investor_movement_id: string }>>`
      SELECT d.investor_movement_id
      FROM dividend_distributions d
      WHERE d.investor_movement_id IS NOT NULL
        AND (${filtre}::uuid IS NULL OR d.project_id = ${filtre}::uuid)
      GROUP BY d.investor_movement_id
      HAVING count(*) > 1
    `;

    return [
      {
        code: 'dividende-sans-projection',
        label: 'Dividendes versés à un investisseur qui est aussi détenteur, sans ligne au capital',
        why:
          'La vue par détenteur de parts sous-estimerait alors ce qui a réellement été versé, ' +
          'et les deux tables donneraient deux réponses.',
        count: sansProjection.length,
        sample: sansProjection.map((l) => l.id).slice(0, 5),
      },
      {
        code: 'projection-sans-mouvement',
        label: 'Lignes de dividende désignant un mouvement d’investisseur qui n’existe plus',
        why: 'Le lien pointe dans le vide : la ligne ne se rattache plus à rien de vérifiable.',
        count: projectionSansMouvement.length,
        sample: projectionSansMouvement.map((l) => l.id).slice(0, 5),
      },
      {
        code: 'double-projection',
        label: 'Mouvements de dividende projetés deux fois au capital',
        why:
          'Le montant serait compté deux fois dans la vue par détenteur. L’unicité n’est pas ' +
          'posée en base — voir le commentaire du schéma —, donc ce contrôle est le seul filet.',
        count: doubleProjection.length,
        sample: doubleProjection.map((l) => l.investor_movement_id).slice(0, 5),
      },
    ];
  }

  /**
   * Trous dans la numérotation des documents émis.
   *
   * La loi française impose une numérotation séquentielle **sans trou** par
   * type et par année. Le service la garantit à l'écriture ; ce contrôle
   * vérifie l'état réel, ce qui est une autre question — une suppression
   * manuelle en base laisserait un trou qu'aucun test d'écriture ne verrait.
   */
  private async billingFindings(): Promise<AuditFinding[]> {
    const trous = await this.prisma.$queryRaw<
      Array<{ owner_id: string; type: string; year: number }>
    >`
      SELECT owner_id, type, year
      FROM billing_documents
      WHERE status <> 'brouillon'
      GROUP BY owner_id, type, year
      HAVING max(sequence) <> count(*)
    `;

    return [
      {
        code: 'numerotation-a-trous',
        label: 'Numérotation de facturation non continue, par propriétaire, type et année',
        why:
          'Le droit français impose une séquence sans trou. Un numéro manquant se remarque à un ' +
          'contrôle, et il est trop tard pour l’expliquer.',
        count: trous.length,
        sample: trous.map((t) => `${t.owner_id} ${t.type} ${t.year}`).slice(0, 5),
      },
    ];
  }
}
