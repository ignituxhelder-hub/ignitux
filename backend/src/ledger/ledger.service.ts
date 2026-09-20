import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IGNITUX_CHART, isAccountKind } from './chart-of-accounts.js';
import {
  validateEntry,
  type AccountRef,
  type DraftLine,
  type EntryProblem,
} from './journal-entry.js';
import {
  describeOwner,
  IGNITUX,
  ownerColumns,
  ownerFromColumns,
  ownerWhere,
  sameOwner,
  type LedgerOwner,
} from './ledger-owner.js';

export interface OpenAccountInput {
  code: string;
  label: string;
  /**
   * Chaîne libre, et pas `AccountKind`, exprès.
   *
   * L'appelant est un contrôleur HTTP : la valeur vient du réseau et n'est
   * une nature de compte valide que si on le vérifie. La typer étroite
   * obligerait le contrôleur à mentir au compilateur avec un `as`, et le
   * contrôle ci-dessous deviendrait du code que TypeScript croit mort alors
   * qu'il est le seul rempart réel.
   */
  kind: string;
  currency?: string;
}

export interface RecordEntryInput {
  occurredOn: Date;
  label: string;
  reference?: string;
  currency?: string;
  lines: DraftLine[];
}

export interface TransferInput {
  from: { owner: LedgerOwner; debitedAccountCode: string; creditedAccountCode: string };
  to: { owner: LedgerOwner; debitedAccountCode: string; creditedAccountCode: string };
  amountCents: number;
  occurredOn: Date;
  label: string;
  currency?: string;
  reference?: string;
}

export interface BalanceLine {
  accountId: string;
  code: string;
  label: string;
  kind: string;
  debitCents: number;
  creditCents: number;
  /** Débit moins crédit. Positif pour un solde débiteur. */
  balanceCents: number;
}

export interface TrialBalance {
  owner: LedgerOwner;
  currency: string;
  lines: BalanceLine[];
  totalDebitCents: number;
  totalCreditCents: number;
  /** Une comptabilité en partie double équilibre toujours. Si non, il y a un défaut. */
  balanced: boolean;
}

export interface SeparationAudit {
  /** Écritures dont une ligne touche le compte d'un autre propriétaire. */
  mixedEntryIds: string[];
  /** Écritures dont les débits ne couvrent pas les crédits. */
  unbalancedEntryIds: string[];
  /** Écritures désignant une contrepartie qui ne les désigne pas en retour. */
  danglingCounterpartIds: string[];
  /** Vrai quand les trois listes sont vides. */
  clean: boolean;
}

/**
 * LA COMPTABILITÉ, ET LA FRONTIÈRE ENTRE LES CAISSES.
 *
 * Deux jeux de livres cohabitent dans les mêmes tables : ceux d'IGNITUX et
 * ceux de chaque personne. Ce qui les sépare n'est pas une convention de
 * nommage mais un invariant vérifié à l'écriture, refusé par le moteur
 * constitutionnel, et contrôlable après coup par `separationAudit()`.
 *
 * Une seule opération traverse la frontière — `recordTransfer` — et elle ne
 * la traverse justement pas : elle produit deux écritures distinctes,
 * équilibrées chacune chez son propriétaire, qui se désignent l'une l'autre.
 */
@Injectable()
export class LedgerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitution: ConstitutionService,
  ) {}

  /**
   * Semis du plan comptable d'IGNITUX au démarrage, même convention que
   * ConstitutionService et ComplianceService.
   *
   * Sans lui, les comptes d'IGNITUX n'existeraient que dans les tests : le
   * jour où le produit voudrait enregistrer un abonnement encaissé, il
   * n'aurait aucun compte où l'écrire. Et le plan comptable d'IGNITUX est
   * bien une donnée de référence — le même pour tout le monde, défini par le
   * code — au même titre que le texte des articles.
   *
   * Rien de tel n'est semé chez les personnes : leur comptabilité leur
   * appartient, elles ouvrent les comptes dont elles ont besoin. Voir
   * chart-of-accounts.ts.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureIgnituxChart();
  }

  // ── Le plan comptable ───────────────────────────────────────────────────

  async openAccount(owner: LedgerOwner, input: OpenAccountInput) {
    if (!isAccountKind(input.kind)) {
      throw new BadRequestException(`Nature de compte inconnue « ${input.kind} ».`);
    }
    const code = input.code.trim();
    if (!code) throw new BadRequestException('Un compte a un code.');

    const existing = await this.prisma.ledger_accounts.findFirst({
      where: { ...ownerWhere(owner), code },
    });
    if (existing) {
      throw new BadRequestException(`Le compte « ${code} » existe déjà chez ${describeOwner(owner)}.`);
    }

    return this.prisma.ledger_accounts.create({
      data: {
        ...ownerColumns(owner),
        code,
        label: input.label,
        kind: input.kind,
        currency: input.currency ?? 'EUR',
      },
    });
  }

  listAccounts(owner: LedgerOwner) {
    return this.prisma.ledger_accounts.findMany({
      where: ownerWhere(owner),
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Ouvre les comptes d'IGNITUX qui manquent encore.
   *
   * Idempotent, et volontairement limité à IGNITUX : rien n'est déposé
   * d'office dans les livres d'une personne. Voir chart-of-accounts.ts.
   */
  async ensureIgnituxChart(): Promise<{ created: string[] }> {
    const existing = await this.prisma.ledger_accounts.findMany({
      where: ownerWhere(IGNITUX),
      select: { code: true },
    });
    const known = new Set(existing.map((account) => account.code));
    const owner = ownerColumns(IGNITUX);

    // Upsert et non « créer ce qui manque » : corriger le libellé d'un compte
    // dans le code doit le corriger en base au prochain lancement, comme pour
    // le texte des articles. Le code du compte, lui, est la clé — le changer
    // crée un compte, ce qui est le comportement voulu.
    for (const seed of IGNITUX_CHART) {
      await this.prisma.ledger_accounts.upsert({
        where: {
          owner_type_owner_id_code: {
            owner_type: owner.owner_type,
            owner_id: owner.owner_id,
            code: seed.code,
          },
        },
        create: { ...owner, code: seed.code, label: seed.label, kind: seed.kind, currency: 'EUR' },
        update: { label: seed.label, kind: seed.kind },
      });
    }

    return { created: IGNITUX_CHART.filter((seed) => !known.has(seed.code)).map((s) => s.code) };
  }

  // ── Le journal ──────────────────────────────────────────────────────────

  async recordEntry(owner: LedgerOwner, input: RecordEntryInput) {
    const currency = input.currency ?? 'EUR';
    const accounts = await this.loadAccounts(input.lines);

    // Un compte inconnu se traite avant tout le reste : sans lui, on ne peut
    // même pas dire à qui appartient la ligne, donc pas se prononcer sur le
    // mélange des caisses.
    const unknown = input.lines.filter((line) => !accounts.has(line.accountId));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Compte inconnu : ${[...new Set(unknown.map((line) => line.accountId))].join(', ')}.`,
      );
    }

    // Le mélange des caisses passe par le moteur constitutionnel plutôt que
    // par une simple erreur de saisie : c'est la seule façon qu'une tentative
    // laisse une trace dans `constitution_violations`. Le refus est un 422,
    // pas un 400 — ce n'est pas une saisie malformée, c'est une limite.
    await this.constitution.guard(
      {
        kind: 'record_ledger_entry',
        entryOwner: describeOwner(owner),
        lineOwners: input.lines.map((line) => describeOwner(accounts.get(line.accountId)!.owner)),
      },
      owner.type === 'user' ? { userId: owner.userId } : {},
    );

    const problems = validateEntry({ owner, currency, lines: input.lines, accounts });
    const remaining = problems.filter((problem) => problem.code !== 'proprietaires-melanges');
    if (remaining.length > 0) {
      throw new BadRequestException(describeProblems(remaining));
    }

    return this.prisma.ledger_entries.create({
      data: {
        ...ownerColumns(owner),
        occurred_on: input.occurredOn,
        label: input.label,
        reference: input.reference ?? null,
        currency,
        lines: {
          create: input.lines.map((line) => ({
            account_id: line.accountId,
            debit_cents: line.debitCents,
            credit_cents: line.creditCents,
            description: line.description ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  }

  listEntries(owner: LedgerOwner, range?: { from?: Date; to?: Date }) {
    return this.prisma.ledger_entries.findMany({
      where: {
        ...ownerWhere(owner),
        ...(range?.from || range?.to
          ? { occurred_on: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
      include: { lines: { include: { account: true } } },
      orderBy: [{ occurred_on: 'asc' }, { created_at: 'asc' }],
    });
  }

  // ── La balance ──────────────────────────────────────────────────────────

  async trialBalance(owner: LedgerOwner, currency = 'EUR'): Promise<TrialBalance> {
    const accounts = await this.prisma.ledger_accounts.findMany({
      where: { ...ownerWhere(owner), currency },
      orderBy: { code: 'asc' },
      include: { lines: { include: { entry: true } } },
    });

    const lines: BalanceLine[] = accounts.map((account) => {
      const debitCents = account.lines.reduce((total, line) => total + line.debit_cents, 0);
      const creditCents = account.lines.reduce((total, line) => total + line.credit_cents, 0);
      return {
        accountId: account.id,
        code: account.code,
        label: account.label,
        kind: account.kind,
        debitCents,
        creditCents,
        balanceCents: debitCents - creditCents,
      };
    });

    const totalDebitCents = lines.reduce((total, line) => total + line.debitCents, 0);
    const totalCreditCents = lines.reduce((total, line) => total + line.creditCents, 0);

    return {
      owner,
      currency,
      lines,
      totalDebitCents,
      totalCreditCents,
      balanced: totalDebitCents === totalCreditCents,
    };
  }

  // ── La frontière ────────────────────────────────────────────────────────

  /**
   * Un mouvement d'argent entre deux comptabilités.
   *
   * **C'est la seule opération autorisée à concerner deux propriétaires, et
   * c'est précisément pour ça qu'elle n'écrit pas une écriture commune.**
   * Elle en écrit deux, chacune équilibrée chez son propriétaire, qui se
   * désignent mutuellement. Les deux naissent dans la même transaction : un
   * virement à moitié enregistré serait pire que pas d'enregistrement du
   * tout, puisqu'il ferait apparaître de l'argent d'un côté sans le faire
   * disparaître de l'autre.
   */
  async recordTransfer(input: TransferInput) {
    if (sameOwner(input.from.owner, input.to.owner)) {
      throw new BadRequestException(
        "Un virement relie deux comptabilités différentes. À l'intérieur d'une même comptabilité, " +
          "c'est une écriture ordinaire.",
      );
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('Le montant d’un virement est un nombre de centimes positif.');
    }

    const currency = input.currency ?? 'EUR';
    const [fromDebited, fromCredited, toDebited, toCredited] = await Promise.all([
      this.requireAccount(input.from.owner, input.from.debitedAccountCode),
      this.requireAccount(input.from.owner, input.from.creditedAccountCode),
      this.requireAccount(input.to.owner, input.to.debitedAccountCode),
      this.requireAccount(input.to.owner, input.to.creditedAccountCode),
    ]);

    // recordTransfer construit ses lignes lui-meme et ne passe donc pas par
    // validateEntry : les controles de propriete et d equilibre sont tenus
    // par construction (requireAccount filtre sur le proprietaire, les deux
    // lignes portent le meme montant), mais celui de la devise ne l etait
    // pas. Un compte en dollars recevant un virement declare en euros
    // aurait produit une ecriture fausse qu aucun audit ne rattrape.
    const devisesEtrangeres = [fromDebited, fromCredited, toDebited, toCredited].filter(
      (compte) => compte.currency !== currency,
    );
    if (devisesEtrangeres.length > 0) {
      throw new BadRequestException(
        `Virement en ${currency} vers des comptes en ` +
          `${[...new Set(devisesEtrangeres.map((c) => c.currency))].join(", ")}. ` +
          "Un virement ne convertit rien : les quatre comptes doivent porter la meme devise.",
      );
    }

    const side = (
      owner: LedgerOwner,
      debited: { id: string },
      credited: { id: string },
    ) => ({
      ...ownerColumns(owner),
      occurred_on: input.occurredOn,
      label: input.label,
      reference: input.reference ?? null,
      currency,
      lines: {
        create: [
          { account_id: debited.id, debit_cents: input.amountCents, credit_cents: 0 },
          { account_id: credited.id, debit_cents: 0, credit_cents: input.amountCents },
        ],
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const fromEntry = await tx.ledger_entries.create({
        data: side(input.from.owner, fromDebited, fromCredited),
        include: { lines: true },
      });
      const toEntry = await tx.ledger_entries.create({
        data: side(input.to.owner, toDebited, toCredited),
        include: { lines: true },
      });

      // Le lien se pose après coup : chacune a besoin de l'identifiant de
      // l'autre, ce qu'aucune des deux ne connaît au moment de sa création.
      await tx.ledger_entries.update({
        where: { id: fromEntry.id },
        data: { counterpart_entry_id: toEntry.id },
      });
      await tx.ledger_entries.update({
        where: { id: toEntry.id },
        data: { counterpart_entry_id: fromEntry.id },
      });

      return {
        from: { ...fromEntry, counterpart_entry_id: toEntry.id },
        to: { ...toEntry, counterpart_entry_id: fromEntry.id },
      };
    });
  }

  // ── Le contrôle ─────────────────────────────────────────────────────────

  /**
   * Relit toute la comptabilité et cherche les trois défauts qui rendraient
   * la séparation fausse.
   *
   * En SQL plutôt qu'en TypeScript : un contrôle qui chargerait tout en
   * mémoire cesserait de tourner le jour où il y aurait de quoi contrôler.
   * Celui-ci reste utilisable quand la base sera pleine, ce qui est la seule
   * condition pour qu'il serve encore.
   */
  async separationAudit(): Promise<SeparationAudit> {
    const mixed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT e.id
      FROM ledger_entries e
      JOIN ledger_lines l ON l.entry_id = e.id
      JOIN ledger_accounts a ON a.id = l.account_id
      WHERE a.owner_type <> e.owner_type OR a.owner_id <> e.owner_id
    `;

    const unbalanced = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT e.id
      FROM ledger_entries e
      JOIN ledger_lines l ON l.entry_id = e.id
      GROUP BY e.id
      HAVING SUM(l.debit_cents) <> SUM(l.credit_cents)
    `;

    const dangling = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT e.id
      FROM ledger_entries e
      LEFT JOIN ledger_entries c ON c.id = e.counterpart_entry_id
      WHERE e.counterpart_entry_id IS NOT NULL
        AND (c.id IS NULL OR c.counterpart_entry_id IS DISTINCT FROM e.id)
    `;

    const mixedEntryIds = mixed.map((row) => row.id);
    const unbalancedEntryIds = unbalanced.map((row) => row.id);
    const danglingCounterpartIds = dangling.map((row) => row.id);

    return {
      mixedEntryIds,
      unbalancedEntryIds,
      danglingCounterpartIds,
      clean:
        mixedEntryIds.length === 0 &&
        unbalancedEntryIds.length === 0 &&
        danglingCounterpartIds.length === 0,
    };
  }

  // ── La suppression de compte ────────────────────────────────────────────

  /**
   * Efface les livres d'une personne. Pas ceux d'IGNITUX.
   *
   * Contrairement au journal des coûts IA — qui reste, parce que la dépense
   * a eu lieu du côté d'IGNITUX et que l'effacer changerait un total déjà
   * clos — la comptabilité d'une personne lui appartient entièrement.
   * IGNITUX n'a aucune raison de conserver les livres de quelqu'un qui s'en
   * va, et l'article 13 dit de ne pas garder ce qui n'est pas nécessaire.
   *
   * Les écritures d'IGNITUX qui désignaient une écriture supprimée perdent
   * ce lien : le fait reste dans les livres d'IGNITUX, l'identité part. Le
   * même principe qu'ailleurs, appliqué à un pointeur.
   *
   * Renvoie les opérations à jouer dans la transaction de suppression du
   * compte, plutôt que de les exécuter : la suppression doit être atomique
   * avec le reste, et une transaction ouverte ici ne le serait pas.
   */
  async deletionOperations(userId: string) {
    const owner = ownerWhere({ type: 'user', userId });

    const entries = await this.prisma.ledger_entries.findMany({
      where: owner,
      select: { id: true },
    });
    const entryIds = entries.map((entry) => entry.id);

    return [
      // 1. Les écritures d'en face oublient leur contrepartie.
      this.prisma.ledger_entries.updateMany({
        where: { counterpart_entry_id: { in: entryIds } },
        data: { counterpart_entry_id: null },
      }),
      // 2. Les mouvements bancaires oublient l'écriture qu'ils désignaient.
      this.prisma.bank_transactions.updateMany({
        where: { reconciled_entry_id: { in: entryIds } },
        data: { reconciled_entry_id: null },
      }),
      // 3. Les lignes partent avec leurs écritures (cascade), mais on les
      //    retire explicitement pour pouvoir supprimer les comptes ensuite :
      //    `ledger_lines.account_id` est en `Restrict`, ce qui est voulu —
      //    un compte ne disparaît pas en emportant des écritures en silence.
      this.prisma.ledger_lines.deleteMany({ where: { entry_id: { in: entryIds } } }),
      this.prisma.ledger_entries.deleteMany({ where: owner }),
      this.prisma.bank_accounts.deleteMany({ where: owner }),
      this.prisma.ledger_accounts.deleteMany({ where: owner }),
    ];
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private async loadAccounts(lines: ReadonlyArray<DraftLine>): Promise<Map<string, AccountRef>> {
    const ids = [...new Set(lines.map((line) => line.accountId))];
    const rows = await this.prisma.ledger_accounts.findMany({ where: { id: { in: ids } } });
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, owner: ownerFromColumns(row), currency: row.currency } satisfies AccountRef,
      ]),
    );
  }

  private async requireAccount(owner: LedgerOwner, code: string) {
    const account = await this.prisma.ledger_accounts.findFirst({
      where: { ...ownerWhere(owner), code },
    });
    if (!account) {
      throw new NotFoundException(`${describeOwner(owner)} n'a pas de compte « ${code} ».`);
    }
    return account;
  }
}

function describeProblems(problems: ReadonlyArray<EntryProblem>): string {
  return problems.map((problem) => problem.message).join(' ');
}
