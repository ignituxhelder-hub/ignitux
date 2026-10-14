import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Espace } from '../equipe/espace.decorator.js';
import { userOwner } from '../ledger/ledger-owner.js';
import { BankingService } from './banking.service.js';
import { DeclareBankAccountDto, ImportTransactionDto, ReconcileDto } from './dto/banking.dto.js';

/**
 * LES COMPTES BANCAIRES DE LA PERSONNE CONNECTÉE.
 *
 * Comme pour la comptabilité : le propriétaire vient du jeton, jamais d'un
 * paramètre, et les comptes d'IGNITUX ne sont exposés par aucune route.
 *
 * Rappel de ce que ces routes ne font pas : aucun virement n'est émis, aucun
 * compte n'est synchronisé avec une banque. Ce sont des déclarations et des
 * saisies. Voir BankingService.
 */
@ApiTags('banque')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('banque')
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('comptes')
  listAccounts(@Espace('argent') ownerId: string) {
    return this.banking.listAccounts(userOwner(ownerId));
  }

  @Post('comptes')
  declareAccount(@Espace('argent') ownerId: string, @Body() dto: DeclareBankAccountDto) {
    return this.banking.declareAccount(userOwner(ownerId), {
      label: dto.label,
      kind: dto.kind,
      currency: dto.currency,
      ibanLast4: dto.ibanLast4,
      ledgerAccountCode: dto.ledgerAccountCode,
    });
  }

  @Get('comptes/:id/mouvements')
  listTransactions(
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.banking.listTransactions(userOwner(ownerId), id);
  }

  @Post('comptes/:id/mouvements')
  importTransaction(
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportTransactionDto,
  ) {
    return this.banking.importTransaction(userOwner(ownerId), id, {
      amountCents: dto.amountCents,
      occurredOn: new Date(dto.occurredOn),
      label: dto.label,
      externalRef: dto.externalRef,
    });
  }

  @Get('comptes/:id/solde')
  balance(@Espace('argent') ownerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.banking.balance(userOwner(ownerId), id);
  }

  @Post('mouvements/:id/rapprochement')
  reconcile(
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileDto,
  ) {
    return this.banking.reconcile(userOwner(ownerId), id, dto.entryId);
  }
}
