import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequireRole } from '../roles/require-role.decorator.js';
import { RoleGuard } from '../roles/role.guard.js';
import { ModifierEvaluationDto, RefaireEvaluationDto, RefuserEvaluationDto } from './dto/evaluation.dto.js';
import { EvaluationRevueService } from './evaluation-revue.service.js';
import { EvaluationService } from './evaluation.service.js';

/** L'évaluation de financement, côté entrepreneur : propriétaire du projet seulement. */
@ApiTags('evaluation-financement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/evaluations-financement')
export class EvaluationController {
  constructor(private readonly evaluations: EvaluationService) {}

  // Un appel IA payé par le propriétaire : limite propre, en plus de la limite globale.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  demander(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.evaluations.demander(user.id, projectId);
  }

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.evaluations.lister(user.id, projectId);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { fichier, nom } = await this.evaluations.pdf(user.id, projectId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Cache-Control': 'no-store',
    });
    res.send(fichier);
  }
}

/** La revue des évaluations : administrateurs seulement, sur toutes les routes. */
@ApiTags('evaluation-financement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard)
@RequireRole('administrateur')
@Controller('evaluations-financement/revue')
export class EvaluationRevueController {
  constructor(private readonly revue: EvaluationRevueService) {}

  @Get()
  file() {
    return this.revue.file();
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.revue.detail(id);
  }

  @Patch(':id')
  modifier(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierEvaluationDto,
  ) {
    return this.revue.modifier(admin.id, id, dto.changements, dto.noteIgnitux, dto.version);
  }

  @Post(':id/valider')
  @HttpCode(HttpStatus.NO_CONTENT)
  valider(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.revue.valider(admin.id, id);
  }

  @Post(':id/refaire')
  @HttpCode(HttpStatus.NO_CONTENT)
  refaire(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefaireEvaluationDto,
  ) {
    return this.revue.faireRefaire(admin.id, id, dto.consigne);
  }

  @Post(':id/refuser')
  @HttpCode(HttpStatus.NO_CONTENT)
  refuser(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuserEvaluationDto,
  ) {
    return this.revue.refuser(admin.id, id, dto.motif);
  }
}
