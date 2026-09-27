import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service.js';
import type { DraftLine } from '../ledger/journal-entry.js';
import { ownerWhere, userOwner, type LedgerOwner } from '../ledger/ledger-owner.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RecordDayInput {
  occurredOn: Date;
  cashCents: number;
  cardCents: number;
  vatCents: number;
  note?: string;
}

interface AccountSeed {
  code: string;
  label: string;
  kind: string;
}

/**
 * CAISSE — le point d'intégration côté Ignitux d'une vraie caisse certifiée.
 *
 * Ignitux n'encaisse jamais rien lui-même : ce service reçoit le relevé de
 * fin de journée saisi à la main (espèces, carte, TVA collectée) et le
 * traduit en une écriture comptable équilibrée, via LedgerService — il ne
 * duplique ni la validation d'équilibre ni le plan de comptes, il les
 * réutilise.
 *
 * Les quatre comptes utilisés (Caisse, Carte à encaisser, TVA collectée,
 * Ventes) n'existent pas par défaut chez une personne — voir
 * ledger/chart-of-accounts.ts : sa comptabilité lui appartient. Ils sont donc
 * ouverts à la volée au premier relevé, comme un compte manquant plutôt que
 * comme une erreur.
 */
@Injectable()
export class CaisseService {
  private static readonly COMPTE_CAISSE: AccountSeed = { code: '530', label: 'Caisse', kind: 'actif' };
  private static readonly COMPTE_CARTE: AccountSeed = {
    code: '511',
    label: 'Carte à encaisser',
    kind: 'actif',
  };
  private static readonly COMPTE_TVA: AccountSeed = {
    code: '4457',
    label: 'TVA collectée',
    kind: 'passif',
  };
  private static readonly COMPTE_VENTES: AccountSeed = { code: '707', label: 'Ventes', kind: 'produit' };

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async recordDay(ownerId: string, input: RecordDayInput) {
    const total = input.cashCents + input.cardCents;
    if (total <= 0) {
      throw new BadRequestException('Un relevé de caisse porte au moins un montant positif.');
    }
    if (input.vatCents > total) {
      throw new BadRequestException(
        'La TVA collectée ne peut pas dépasser le total encaissé (espèces + carte).',
      );
    }

    const owner = userOwner(ownerId);
    const lines: DraftLine[] = [];

    if (input.cashCents > 0) {
      const compte = await this.ensureAccount(owner, CaisseService.COMPTE_CAISSE);
      lines.push({ accountId: compte.id, debitCents: input.cashCents, creditCents: 0 });
    }
    if (input.cardCents > 0) {
      const compte = await this.ensureAccount(owner, CaisseService.COMPTE_CARTE);
      lines.push({ accountId: compte.id, debitCents: input.cardCents, creditCents: 0 });
    }
    if (input.vatCents > 0) {
      const compte = await this.ensureAccount(owner, CaisseService.COMPTE_TVA);
      lines.push({ accountId: compte.id, debitCents: 0, creditCents: input.vatCents });
    }
    // S'il ne reste rien après la TVA (cas limite), pas de ligne « Ventes » à
    // zéro : une ligne à zéro est refusée par validateEntry, et l'écriture
    // équilibre déjà sans elle.
    const ventes = total - input.vatCents;
    if (ventes > 0) {
      const compte = await this.ensureAccount(owner, CaisseService.COMPTE_VENTES);
      lines.push({ accountId: compte.id, debitCents: 0, creditCents: ventes });
    }

    const entry = await this.ledger.recordEntry(owner, {
      occurredOn: input.occurredOn,
      label: `Relevé de caisse du ${input.occurredOn.toLocaleDateString('fr-FR')}`,
      lines,
    });

    return this.prisma.cash_register_entries.create({
      data: {
        owner_id: ownerId,
        occurred_on: input.occurredOn,
        cash_cents: input.cashCents,
        card_cents: input.cardCents,
        vat_cents: input.vatCents,
        note: input.note ?? null,
        ledger_entry_id: entry.id,
      },
    });
  }

  list(ownerId: string) {
    return this.prisma.cash_register_entries.findMany({
      where: { owner_id: ownerId },
      orderBy: { occurred_on: 'desc' },
    });
  }

  private async ensureAccount(owner: LedgerOwner, seed: AccountSeed) {
    const existing = await this.prisma.ledger_accounts.findFirst({
      where: { ...ownerWhere(owner), code: seed.code },
    });
    if (existing) return existing;
    return this.ledger.openAccount(owner, seed);
  }
}
