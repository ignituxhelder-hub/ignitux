import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
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
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.banking.listAccounts(userOwner(user.id));
  }

  @Post('comptes')
  declareAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeclareBankAccountDto) {
    return this.banking.declareAccount(userOwner(user.id), {
      label: dto.label,
      kind: dto.kind,
      currency: dto.currency,
      ibanLast4: dto.ibanLast4,
      ledgerAccountCode: dto.ledgerAccountCode,
    });
  }

  @Get('comptes/:id/mouvements')
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.banking.listTransactions(userOwner(user.id), id);
  }

  @Post('comptes/:id/mouvements')
  importTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportTransactionDto,
  ) {
    return this.banking.importTransaction(userOwner(user.id), id, {
      amountCents: dto.amountCents,
      occurredOn: new Date(dto.occurredOn),
      label: dto.label,
      externalRef: dto.externalRef,
    });
  }

  @Get('comptes/:id/solde')
  balance(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.banking.balance(userOwner(user.id), id);
  }

  @Post('mouvements/:id/rapprochement')
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileDto,
  ) {
    return this.banking.reconcile(userOwner(user.id), id, dto.entryId);
  }
}
