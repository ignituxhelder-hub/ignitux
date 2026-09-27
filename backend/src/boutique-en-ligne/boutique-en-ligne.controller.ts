import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';
import {
  CreerProduitDto,
  DeclarerForfaitDto,
  DemarrerConnexionDto,
  FinaliserConnexionDto,
} from './dto/boutique-en-ligne.dto.js';

@ApiTags('boutique-en-ligne')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/boutique-en-ligne')
export class BoutiqueEnLigneController {
  constructor(private readonly service: BoutiqueEnLigneService) {}

  @Get()
  etat(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.etat(user.id, projectId);
  }

  @Post('connexion')
  demarrerConnexion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DemarrerConnexionDto,
  ) {
    return this.service.demarrerConnexion(user.id, projectId, dto.shopDomain);
  }

  /**
   * Authentifié à dessein — voir le commentaire de
   * BoutiqueEnLigneService.finaliserConnexion : c'est ici, pas dans le
   * callback public, que se vérifie que la personne qui termine la
   * connexion est bien celle qui l'a demandée.
   */
  @Post('finaliser')
  finaliser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: FinaliserConnexionDto,
  ) {
    return this.service.finaliserConnexion(user.id, projectId, dto);
  }

  @Post('deconnexion')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deconnecter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.service.deconnecter(user.id, projectId);
  }

  @Patch('forfait')
  declarerForfait(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DeclarerForfaitDto,
  ) {
    return this.service.declarerForfait(user.id, projectId, dto.forfait, dto.prixCentimes);
  }

  @Get('produits')
  listerProduits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.service.listerProduits(user.id, projectId);
  }

  @Post('produits')
  @HttpCode(HttpStatus.CREATED)
  creerProduit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreerProduitDto,
  ) {
    return this.service.creerProduit(user.id, projectId, dto.titre, dto.description ?? null);
  }

  @Get('commandes')
  listerCommandes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.service.listerCommandes(user.id, projectId);
  }
}
