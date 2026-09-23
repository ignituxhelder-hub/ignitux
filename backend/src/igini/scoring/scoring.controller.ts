import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ScoringService } from './scoring.service.js';

@ApiTags('igini-scoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/scores')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  /**
   * L'évolution des scores dans le temps.
   *
   * Déclarée AVANT la route racine : Nest résout les routes dans l'ordre de
   * déclaration, et `historique` doit être reconnu comme un segment littéral
   * plutôt qu'absorbé par un paramètre.
   *
   * Rend une liste, éventuellement vide. Un projet qui n'a jamais été mesuré
   * n'a pas d'historique, et ce n'est pas une erreur.
   */
  @Get('historique')
  historique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.scoringService.historique(user.id, projectId);
  }

  @Get()
  getScoreCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.scoringService.getScoreCard(user.id, projectId);
  }
}
