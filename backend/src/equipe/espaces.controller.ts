import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { HorsEspace } from './espace.decorator.js';
import { EspaceService } from './espace.service.js';

/**
 * Les espaces argent où je peux travailler : le mien, puis celui de chaque
 * propriétaire dont je suis comptable ou associé sur au moins un projet.
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
}
