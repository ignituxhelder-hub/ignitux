import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OFFRES, type OffreId } from './offres-catalogue.js';
import { OffresService } from './offres.service.js';

export class ChangerOffreDto {
  @IsString()
  @IsIn(OFFRES as unknown as string[], {
    message: `offre doit être l'une de : ${OFFRES.join(', ')}.`,
  })
  offre: OffreId;
}

@ApiTags('offres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('offres')
export class OffresController {
  constructor(private readonly offres: OffresService) {}

  /**
   * Le catalogue, et l'offre en cours.
   *
   * Dit aussi si une souscription est seulement possible : quand rien
   * n'encaisse, trois boutons « Choisir » qui échoueraient tous seraient la
   * pire version de cet écran.
   */
  @Get()
  catalogue(@CurrentUser() user: AuthenticatedUser) {
    return this.offres.catalogue(user.id);
  }

  /**
   * Changer d'offre.
   *
   * Sans référence d'encaissement, seule la gratuite passe : le service
   * refuse le reste. Cette route existe donc surtout pour redescendre —
   * monter passera par la notification du fournisseur de paiement, pas par
   * un appel du navigateur.
   */
  @Post('changer')
  changer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangerOffreDto) {
    return this.offres.changer(user.id, dto.offre);
  }
}
