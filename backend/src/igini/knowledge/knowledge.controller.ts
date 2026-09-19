import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  @Get('concepts/search')
  searchConcepts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.knowledgeService.searchConcepts(user.id, { query, category, projectId });
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.knowledgeService.listCategories(user.id, projectId);
  }

  @Get('concepts/:id/neighbourhood')
  getNeighbourhood(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('depth') depth?: string,
  ) {
    // Une profondeur illisible ne doit pas faire échouer la requête : on
    // retombe sur 1, la lecture la plus courante.
    const parsed = Number.parseInt(depth ?? '', 10);
    return this.knowledgeService.getNeighbourhood(user.id, id, Number.isNaN(parsed) ? 1 : parsed);
  }

  @Get('path')
  findPath(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from', ParseUUIDPipe) from: string,
    @Query('to', ParseUUIDPipe) to: string,
  ) {
    return this.knowledgeService.findPath(user.id, from, to);
  }

  @Delete('concepts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConcept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.knowledgeService.deleteConcept(user.id, id);
  }

  @Delete('links/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.knowledgeService.unlink(user.id, id);
  }
}
