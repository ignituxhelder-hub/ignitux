import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OpenAccountDto, RecordEntryDto } from './dto/ledger.dto.js';
import { userOwner } from './ledger-owner.js';
import { LedgerService } from './ledger.service.js';

/**
 * LA COMPTABILITÉ DE LA PERSONNE CONNECTÉE — et rien d'autre.
 *
 * Chaque route dérive son propriétaire du jeton, jamais d'un paramètre. Il
 * n'existe donc aucune requête capable de désigner les livres de quelqu'un
 * d'autre : ce n'est pas qu'elle serait refusée, c'est qu'elle ne peut pas
 * s'écrire.
 *
 * **La comptabilité d'IGNITUX n'est exposée par aucune route.** Le service
 * sait la tenir, mais la publier demanderait un rôle d'exploitant que le
 * produit n'a pas encore ; derrière une simple authentification, n'importe
 * quel compte lirait la trésorerie d'IGNITUX. Même raisonnement que pour le
 * total des coûts IA.
 */
@ApiTags('comptabilite')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comptabilite')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('comptes')
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.ledger.listAccounts(userOwner(user.id));
  }

  @Post('comptes')
  openAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenAccountDto) {
    return this.ledger.openAccount(userOwner(user.id), {
      code: dto.code,
      label: dto.label,
      kind: dto.kind,
      currency: dto.currency,
    });
  }

  @Get('ecritures')
  listEntries(@CurrentUser() user: AuthenticatedUser) {
    return this.ledger.listEntries(userOwner(user.id));
  }

  @Post('ecritures')
  recordEntry(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordEntryDto) {
    return this.ledger.recordEntry(userOwner(user.id), {
      occurredOn: new Date(dto.occurredOn),
      label: dto.label,
      reference: dto.reference,
      currency: dto.currency,
      lines: dto.lines.map((line) => ({
        accountId: line.accountId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        description: line.description,
      })),
    });
  }

  @Get('balance')
  trialBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.ledger.trialBalance(userOwner(user.id));
  }
}
