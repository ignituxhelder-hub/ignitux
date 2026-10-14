import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChoisirAccesArgentDto } from './dto/equipe.dto.js';
import { HorsEspace } from './espace.decorator.js';
import { EspaceService } from './espace.service.js';

/**
 * Les espaces argent où je peux travailler : le mien, puis celui de chaque
 * propriétaire dont je suis comptable ou associé sur au moins un projet et
 * où mon accès est en vigueur (activé, ou automatique et non coupé).
 * Pour `GET /espaces`, l'en-tête `X-Espace` est ignoré : la liste est la même quel que soit
 * l'espace sélectionné (le client la relit pour vérifier un accès perdu).
 */
@ApiTags('equipe')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('espaces')
export class EspacesController {
  constructor(private readonly espaces: EspaceService) {}

  @Get()
  @HorsEspace()
  mesEspaces(@CurrentUser() user: AuthenticatedUser) {
    return this.espaces.mesEspaces(user.id);
  }

  /**
   * L'activité de mon équipe dans MON argent (lecture seule). Volontairement
   * SANS marque : avec l'espace d'un autre, l'intercepteur la refuse (403) —
   * le journal d'un propriétaire n'est lisible que par lui, chez lui.
   */
  @Get('activite')
  activite(@CurrentUser() user: AuthenticatedUser) {
    return this.espaces.activiteDeMonEquipe(user.id);
  }

  /**
   * Qui, parmi mes comptables et associés, a accès à MON argent, et pourquoi.
   * Sans marque, comme `activite` : refusée (403) avec l'espace d'un autre.
   */
  @Get('acces-argent')
  accesArgent(@CurrentUser() user: AuthenticatedUser) {
    return this.espaces.accesArgentDeMonEquipe(user.id);
  }

  /**
   * J'active ou je coupe l'accès d'un de mes comptables ou associés à MON
   * argent. Toujours chez moi (`user.id`) : sans marque, refusée (403) avec
   * l'espace d'un autre ; un membre qui vise quelqu'un hors de sa propre
   * équipe reçoit 404.
   */
  @Put('acces-argent/:memberId')
  choisirAccesArgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: ChoisirAccesArgentDto,
  ) {
    return this.espaces.choisirAccesArgent(user.id, memberId, dto.acces);
  }
}
