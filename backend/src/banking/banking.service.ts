import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConstitutionService } from '../constitution/constitution.service.js';
import {
  describeOwner,
  ownerColumns,
  ownerFromColumns,
  ownerWhere,
  sameOwner,
  type LedgerOwner,
} from '../ledger/ledger-owner.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const BANK_ACCOUNT_KINDS = [
  'courant',
  'reserve',
  'fiscal',
  'investissement',
  'autre',
] as const;
export type BankAccountKind = (typeof BANK_ACCOUNT_KINDS)[number];

export function isBankAccountKind(value: string): value is BankAccountKind {
  return (BANK_ACCOUNT_KINDS as readonly string[]).includes(value);
}

export interface DeclareBankAccountInput {
  label: string;
  /** Chaîne libre, vérifiée ici — même raison que pour OpenAccountInput. */
  kind: string;
  currency?: string;
  /** Les quatre derniers caractères de l'IBAN. Jamais l'IBAN entier. */
  ibanLast4?: string;
  /** Le compte du plan comptable qui reflète ce compte, chez le même propriétaire. */
  ledgerAccountCode?: string;
}

export interface ImportTransactionInput {
  amountCents: number;
  occurredOn: Date;
  label: string;
  externalRef?: string;
}

/**
 * LA CELLULE BANCAIRE.
 *
 * ── Ce qu'elle fait aujourd'hui ──────────────────────────────────────────
 *
 * Elle déclare des comptes bancaires, chacun appartenant à IGNITUX ou à une
 * personne, elle y enregistre des mouvements, et elle les rapproche
 * d'écritures comptables **du même propriétaire**.
 *
 * ── Ce qu'elle ne fait pas, et qu'il ne faut pas croire qu'elle fait ─────
 *
 * Aucune synchronisation bancaire, aucun virement, aucune carte. Aucun
 * fournisseur n'a été choisi — c'est une décision qui appartient au porteur,
 * au même titre que le fournisseur d'email. La colonne `provider` existe et
 * vaut `null` partout : elle dit « saisie manuelle », et c'est le seul mode
 * existant.
 *
 * **Aucun IBAN complet n'est détenu.** Quatre caractères suffisent à
 * reconnaître un compte dans une liste ; l'IBAN entier ne sert qu'à émettre
 * un virement, ce que le produit ne fait pas. Détenir une coordonnée
 * bancaire complète sans pouvoir s'en servir, c'est prendre un risque sans
 * contrepartie. Le jour où un virement partira, ce champ sera à repenser
 * avec le fournisseur retenu — pas à remplir discrètement en attendant.
 */
@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constitution: ConstitutionService,
  ) {}

  async declareAccount(owner: LedgerOwner, input: DeclareBankAccountInput) {
    if (!isBankAccountKind(input.kind)) {
      throw new BadRequestException(`Nature de compte bancaire inconnue « ${input.kind} ».`);
    }
    if (input.ibanLast4 !== undefined && !/^[A-Za-z0-9]{4}$/.test(input.ibanLast4)) {
      throw new BadRequestException(
        "On n'enregistre que les quatre derniers caractères de l'IBAN, pas davantage.",
      );
    }

    let ledgerAccountId: string | null = null;
    if (input.ledgerAccountCode) {
      const account = await this.prisma.ledger_accounts.findFirst({
        where: { ...ownerWhere(owner), code: input.ledgerAccountCode },
      });
      if (!account) {
        throw new NotFoundException(
          `${describeOwner(owner)} n'a pas de compte « ${input.ledgerAccountCode} » à son plan comptable.`,
        );
      }
      ledgerAccountId = account.id;
    }

    return this.prisma.bank_accounts.create({
      data: {
        ...ownerColumns(owner),
        label: input.label,
        kind: input.kind,
        currency: input.currency ?? 'EUR',
        iban_last4: input.ibanLast4 ?? null,
        provider: null,
        ledger_account_id: ledgerAccountId,
      },
    });
  }

  listAccounts(owner: LedgerOwner) {
    return this.prisma.bank_accounts.findMany({
      where: ownerWhere(owner),
      orderBy: { label: 'asc' },
    });
  }

  async importTransaction(owner: LedgerOwner, bankAccountId: string, input: ImportTransactionInput) {
    await this.requireOwnedAccount(owner, bankAccountId);

    if (!Number.isInteger(input.amountCents)) {
      throw new BadRequestException('Un montant bancaire se compte en centimes entiers.');
    }
    if (input.amountCents === 0) {
      throw new BadRequestException('Un mouvement nul ne constate rien.');
    }

    return this.prisma.bank_transactions.create({
      data: {
        bank_account_id: bankAccountId,
        amount_cents: input.amountCents,
        occurred_on: input.occurredOn,
        label: input.label,
        external_ref: input.externalRef ?? null,
      },
    });
  }

  async listTransactions(owner: LedgerOwner, bankAccountId: string) {
    await this.requireOwnedAccount(owner, bankAccountId);
    return this.prisma.bank_transactions.findMany({
      where: { bank_account_id: bankAccountId },
      orderBy: [{ occurred_on: 'asc' }, { created_at: 'asc' }],
    });
  }

  /**
   * Rattache un mouvement bancaire à l'écriture qui le constate.
   *
   * Le contrôle qui compte : les deux doivent appartenir au même
   * propriétaire. Rapprocher le relevé d'une personne d'une écriture
   * d'IGNITUX ferait entrer son argent dans les livres d'IGNITUX par la
   * porte de service — sans écriture à cheval, donc sans que le contrôle du
   * journal s'en aperçoive. C'est exactement le trou que cette méthode
   * ferme, et c'est pourquoi le refus passe par le moteur constitutionnel.
   */
  async reconcile(owner: LedgerOwner, transactionId: string, entryId: string) {
    const transaction = await this.prisma.bank_transactions.findUnique({
      where: { id: transactionId },
      include: { bank_account: true },
    });
    if (!transaction) throw new NotFoundException('Mouvement bancaire introuvable.');

    const bankOwner = ownerFromColumns(transaction.bank_account);
    if (!sameOwner(bankOwner, owner)) {
      throw new ForbiddenException("Ce mouvement n'est pas sur un de tes comptes.");
    }

    const entry = await this.prisma.ledger_entries.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Écriture introuvable.');
    const entryOwner = ownerFromColumns(entry);

    await this.constitution.guard(
      {
        kind: 'reconcile_bank_transaction',
        bankAccountOwner: describeOwner(bankOwner),
        entryOwner: describeOwner(entryOwner),
      },
      owner.type === 'user' ? { userId: owner.userId } : {},
    );

    return this.prisma.bank_transactions.update({
      where: { id: transactionId },
      data: { reconciled_entry_id: entryId },
    });
  }

  /**
   * Solde d'un compte bancaire, et ce qui reste à rapprocher.
   *
   * Le second chiffre est le plus utile des deux : un solde juste avec des
   * mouvements non rapprochés veut dire que la comptabilité ne dit pas encore
   * ce que la banque dit.
   */
  async balance(owner: LedgerOwner, bankAccountId: string) {
    await this.requireOwnedAccount(owner, bankAccountId);

    const transactions = await this.prisma.bank_transactions.findMany({
      where: { bank_account_id: bankAccountId },
      select: { amount_cents: true, reconciled_entry_id: true },
    });

    const balanceCents = transactions.reduce((total, row) => total + row.amount_cents, 0);
    const unreconciled = transactions.filter((row) => row.reconciled_entry_id === null);

    return {
      balanceCents,
      movements: transactions.length,
      unreconciledCount: unreconciled.length,
      unreconciledCents: unreconciled.reduce((total, row) => total + row.amount_cents, 0),
    };
  }

  private async requireOwnedAccount(owner: LedgerOwner, bankAccountId: string) {
    const account = await this.prisma.bank_accounts.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException('Compte bancaire introuvable.');
    if (!sameOwner(ownerFromColumns(account), owner)) {
      // 403 et non 404 : la ressource existe, c'est l'accès qui est refusé.
      // Et surtout pas 401, qui déconnecterait la personne côté interface.
      throw new ForbiddenException("Ce compte bancaire n'est pas le tien.");
    }
    return account;
  }
}
