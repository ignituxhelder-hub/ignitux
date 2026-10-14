import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RepondreQuestionsIginiDto, SaveQuestionnaireDto } from './questionnaire.dto.js';
import { QuestionnaireService } from './questionnaire.service.js';

/**
 * Le questionnaire du projet : ce qu'IGINI avait jusqu'ici à supposer.
 * Propriétaire seulement (404 sinon), comme les générateurs.
 */
@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects/:id/questionnaire')
@UseGuards(JwtAuthGuard)
export class QuestionnaireController {
  constructor(private readonly questionnaire: QuestionnaireService) {}

  @Get()
  vue(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.questionnaire.vue(user.id, id);
  }

  @Put()
  enregistrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveQuestionnaireDto,
  ) {
    return this.questionnaire.enregistrer(user.id, id, dto.reponses, dto.termine);
  }

  // Un appel à Claude : même bride que les générateurs, même s'il ne tourne
  // qu'une fois par projet.
  @Post('questions-igini')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  preparer(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.questionnaire.preparerQuestionsIgini(user.id, id);
  }

  @Put('questions-igini')
  repondre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepondreQuestionsIginiDto,
  ) {
    return this.questionnaire.repondreQuestionsIgini(user.id, id, dto.reponses);
  }
}
