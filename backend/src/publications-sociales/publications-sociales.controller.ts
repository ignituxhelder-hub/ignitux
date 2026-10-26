import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  ConfirmerPublicationDto,
  CreerPublicationDto,
  SuggestionPublicationDto,
} from './dto/publication.dto.js';
import { PublicationsSocialesService } from './publications-sociales.service.js';
import type { Plateforme } from './reseaux-sociaux.providers.js';

@ApiTags('reseaux-sociaux')
@Controller('reseaux-sociaux')
export class PublicationsSocialesController {
  private readonly logger = new Logger(PublicationsSocialesController.name);

  constructor(private readonly service: PublicationsSocialesService) {}

  /** Ouvert à cette personne ? Quelles plateformes sont configurées sur ce serveur ? */
  @Get('acces')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  acces(@CurrentUser() user: AuthenticatedUser) {
    return this.service.acces(user.email);
  }

  @Post('suggestion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  suggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SuggestionPublicationDto,
  ) {
    return this.service.genererSuggestion(user, dto.platform, dto.brief);
  }

  @Get('comptes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  comptes(@CurrentUser() user: AuthenticatedUser) {
    return this.service.comptes(user.id);
  }

  @Post('oauth/:platform/demarrer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  demarrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
  ) {
    return this.service.demarrerConnexion(user, this.platform(platform));
  }

  @Get('oauth/:platform/callback')
  async callback(
    @Param('platform') platformRaw: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    const platform = this.platform(platformRaw);
    const frontend = new URL(
      '/reseaux-sociaux',
      process.env.FRONTEND_URL || 'http://localhost:3001',
    );
    if (!code || !state || error) {
      frontend.searchParams.set('connexion', 'refusee');
      return response.redirect(frontend.toString());
    }
    try {
      await this.service.finaliserConnexion(platform, code, state);
      frontend.searchParams.set('connexion', platform);
      frontend.searchParams.set('etat', 'ok');
    } catch (erreur) {
      // Jamais le code ni le jeton dans le journal : seulement ce qui a échoué.
      this.logger.warn(`Connexion ${platform} échouée : ${(erreur as Error).message}`);
      frontend.searchParams.set('connexion', 'erreur');
    }
    return response.redirect(frontend.toString());
  }

  @Delete('comptes/:platform')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  deconnecter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
  ) {
    return this.service.deconnecter(user.id, this.platform(platform));
  }

  @Get('tiktok/options')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  optionsTikTok(@CurrentUser() user: AuthenticatedUser) {
    return this.service.optionsTikTok(user.id);
  }

  @Post('publications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  creer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreerPublicationDto,
  ) {
    return this.service.creer(user, {
      platform: dto.platform,
      caption: dto.caption,
      mediaUrl: dto.mediaUrl,
      mediaType: dto.mediaType,
      privacyLevel: dto.privacyLevel,
      allowComments: dto.allowComments,
      allowDuet: dto.allowDuet,
      allowStitch: dto.allowStitch,
      brandOrganic: dto.brandOrganic,
      brandContent: dto.brandContent,
      mediaDurationSeconds: dto.mediaDurationSeconds,
    });
  }

  @Get('publications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  liste(@CurrentUser() user: AuthenticatedUser) {
    return this.service.liste(user.id);
  }

  @Delete('publications/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.supprimer(user.id, id);
  }

  @Post('publications/:id/publier')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  publier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmerPublicationDto,
  ) {
    return this.service.publier(user, id, dto.musicConsent);
  }

  @Get('publications/:id/statut')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  verifierStatut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.verifierStatut(user.id, id);
  }

  private platform(value: string): Plateforme {
    if (value !== 'instagram' && value !== 'tiktok')
      throw new BadRequestException('Plateforme sociale invalide.');
    return value;
  }
}
