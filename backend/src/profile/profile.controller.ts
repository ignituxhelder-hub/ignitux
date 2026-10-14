import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SaveCvDto } from './dto/cv.dto.js';
import { SaveProfileDto } from './dto/profile.dto.js';
import { CvService } from './cv.service.js';
import type { FieldMoment } from './profile-fields.js';
import { ProfileService } from './profile.service.js';

/**
 * Le profil, et ce qu'il faut demander maintenant.
 *
 * `/profil/a-demander/:moment` est la route qui porte le principe : un écran
 * n'affiche pas un formulaire complet, il demande au serveur ce qui est
 * utile ICI et pose uniquement ces questions-là.
 */
@ApiTags('profil')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profil')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly cv: CvService,
  ) {}

  @Get()
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.view(user.id);
  }

  @Put()
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveProfileDto) {
    return this.profile.save(user.id, dto.values);
  }

  /** Le CV décrit : expériences et formations, dans l'ordre choisi. */
  @Get('cv')
  monCv(@CurrentUser() user: AuthenticatedUser) {
    return this.cv.lire(user.id);
  }

  @Put('cv')
  enregistrerCv(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveCvDto) {
    return this.cv.enregistrer(user.id, dto);
  }

  @Get('a-demander/:moment')
  ask(@CurrentUser() user: AuthenticatedUser, @Param('moment') moment: string) {
    // Un moment inconnu rend une liste vide plutôt qu'une erreur : un écran
    // qui se trompe de nom ne doit pas casser, il ne doit rien demander.
    return this.profile.ask(user.id, moment as FieldMoment);
  }
}
