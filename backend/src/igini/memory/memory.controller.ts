import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { CreateMemoryDto } from './dto/create-memory.dto.js';
import { LinkMemoryDto } from './dto/link-memory.dto.js';
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
    return this.memoryService.remember(user.id, dto.category, dto.content, dto.projectId);
  }

  @Get()
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.memoryService.search(user.id, query, projectId);
  }

  @Get('summary')
  summarize(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.memoryService.summarize(user.id, projectId).then((summary) => ({ summary }));
  }

  @Post(':id/link')
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkMemoryDto,
  ) {
    return this.memoryService.linkToProject(user.id, id, dto.projectId);
  }
}
