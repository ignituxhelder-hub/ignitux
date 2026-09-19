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
import { CreateMemoryDto } from './dto/create-memory.dto.js';
import { LinkMemoryDto } from './dto/link-memory.dto.js';
import { MEMORY_CATEGORIES, type MemoryCategory } from './memory-category.js';
import { MemoryService } from './memory.service.js';

@ApiTags('igini-memory')
@ApiBearerAuth()
@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  remember(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMemoryDto) {
    return this.memoryService.remember(
      user.id,
      dto.category,
      dto.content,
      dto.projectId,
      dto.tags,
    );
  }

  @Get()
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('projectId') projectId?: string,
    @Query('category') category?: string,
    @Query('tags') tags?: string,
  ) {
    return this.memoryService.search(user.id, {
      query,
      projectId,
      // Une catégorie inconnue est ignorée plutôt que rejetée : un filtre
      // d'interface mal formé ne doit pas transformer une recherche en
      // erreur 400 sous les yeux de l'utilisateur.
      category: this.toCategory(category),
      tags: tags ? tags.split(',') : undefined,
    });
  }

  @Get('tags')
  listTags(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.memoryService.listTags(user.id, projectId);
  }

  @Get('summary')
  summarize(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.memoryService.summarize(user.id, projectId).then((summary) => ({ summary }));
  }

  @Get('recall/:projectId')
  recall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.memoryService.recall(user.id, projectId);
  }

  @Post(':id/link')
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkMemoryDto,
  ) {
    return this.memoryService.linkToProject(user.id, id, dto.projectId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.memoryService.forget(user.id, id);
  }

  private toCategory(value?: string): MemoryCategory | undefined {
    return MEMORY_CATEGORIES.includes(value as MemoryCategory)
      ? (value as MemoryCategory)
      : undefined;
  }
}
