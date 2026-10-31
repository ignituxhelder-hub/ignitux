import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EnchainementService } from './enchainement.service.js';

/** L'enchaînement IGINI d'un projet : le lancer, et suivre où il en est. */
@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class EnchainementController {
  constructor(private readonly enchainementService: EnchainementService) {}

  @Get(':id/enchainement')
  voir(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.enchainementService.voir(user.id, id);
  }

  /** 202 : la réponse part tout de suite, les étapes continuent sur le serveur. */
  @Post(':id/enchainement')
  @HttpCode(HttpStatus.ACCEPTED)
  // Chaque lancement engage jusqu'à cinq appels Claude — même limite que les boutons.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  lancer(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.enchainementService.lancer(user.id, id);
  }
}
