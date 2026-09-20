import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { JourneyService } from './journey.service.js';

/**
 * Où en est ce projet, et que faire maintenant.
 *
 * Une seule route : l'interface n'a pas à recomposer le parcours à partir
 * de dix appels, et surtout la règle de déblocage ne doit exister qu'à un
 * endroit. Dupliquée côté écran, elle finirait par diverger — et c'est
 * alors l'écran qui déciderait de la méthode Ignitux.
 */
@ApiTags('parcours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Get(':id/parcours')
  forProject(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.journey.forProject(user.id, id);
  }
}

/**
 * Le résumé de tous mes projets.
 *
 * Sur un préfixe distinct plutôt que `projects/resume` : la route
 * `projects/:id` valide son paramètre comme un UUID, et un segment littéral
 * placé à côté dépendrait alors de l'ordre de déclaration pour être
 * atteint. Une route dont le fonctionnement tient à l'ordre des lignes est
 * une route qui cassera au premier rangement d'imports.
 */
@ApiTags('parcours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('parcours')
export class JourneySummaryController {
  constructor(private readonly journey: JourneyService) {}

  @Get('mes-projets')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.journey.forMyProjects(user.id);
  }
}
