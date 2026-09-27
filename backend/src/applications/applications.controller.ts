import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { APPLICATIONS } from './applications-catalogue.js';
import { ApplicationsService } from './applications.service.js';
import { ChoixBureauDto } from './dto/bureau.dto.js';

/**
 * LES APPLICATIONS.
 *
 * Le catalogue est public : savoir ce qu'Ignitux sait faire ne demande pas
 * de compte. Le lanceur, lui, se calcule depuis le jeton — il ne prend aucun
 * identifiant en paramètre.
 */
@ApiTags('applications')
@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get('applications')
  catalogue() {
    return {
      applications: APPLICATIONS.map((app) => ({
        ...app,
        publics: [...app.publics],
        secteurs: [...app.secteurs],
      })),
      notice:
        'Une application ne détient aucune donnée : tes factures sont à toi, pas à la ' +
        "Facturation. La masquer n'efface rien. Les applications prévues sont nommées " +
        "pour dire ce qui vient, et ne s'ouvrent pas tant qu'elles n'existent pas.",
    };
  }

  @Get('me/applications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.applications.lanceurDe(user.id);
  }

  /**
   * Poser une application sur son bureau, ou l'en retirer. Rend le bureau
   * recalculé, pour que l'écran n'ait pas à deviner ce qui a bougé.
   */
  @Put('me/applications/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  choisir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChoixBureauDto,
  ) {
    return this.applications.choisir(user.id, id, dto.choix);
  }
}
