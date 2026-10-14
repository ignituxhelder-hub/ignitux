import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChangerRoleDto, InviterMembreDto } from './dto/equipe.dto.js';
import { EquipeService } from './equipe.service.js';

/** L'équipe d'un projet. Mêmes adresses que les anciens « collaborateurs ». */
@ApiTags('equipe')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:id')
export class EquipeController {
  constructor(private readonly equipe: EquipeService) {}

  @Get('mon-acces')
  monAcces(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipe.monAcces(user.id, id);
  }

  @Get('collaborators')
  lister(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipe.lister(user.id, id);
  }

  // Chaque invitation envoie un email : pas de rafale.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('collaborators')
  @HttpCode(HttpStatus.CREATED)
  inviter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviterMembreDto,
  ) {
    return this.equipe.inviter(user.id, id, dto.email, dto.role);
  }

  @Patch('collaborators/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  changerRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangerRoleDto,
  ) {
    return this.equipe.changerRole(user.id, id, userId, dto.role);
  }

  @Delete('collaborators/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  retirer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.equipe.retirer(user.id, id, userId);
  }
}
