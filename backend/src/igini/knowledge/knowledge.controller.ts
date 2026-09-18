import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { CreateConceptDto } from './dto/create-concept.dto.js';
import { LinkConceptsDto } from './dto/link-concepts.dto.js';
import { KnowledgeService } from './knowledge.service.js';

@ApiTags('igini-knowledge')
@ApiBearerAuth()
@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('concepts')
  @HttpCode(HttpStatus.CREATED)
  createConcept(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConceptDto) {
    return this.knowledgeService.createConcept(
      user.id,
      dto.name,
      dto.description,
      dto.category,
      dto.projectId,
    );
  }

  @Get('concepts')
  listConcepts(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.knowledgeService.listConcepts(user.id, projectId);
  }

  @Post('concepts/:id/links')
  @HttpCode(HttpStatus.CREATED)
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkConceptsDto,
  ) {
    return this.knowledgeService.link(user.id, id, dto.toConceptId, dto.relationType);
  }

  @Get('graph')
  getGraph(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.knowledgeService.getGraph(user.id, projectId);
  }
}
