import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CommunityService } from './community.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@ApiTags('community')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('community/projects')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get()
  listPublicProjects() {
    return this.communityService.listPublicProjects();
  }

  @Get(':id')
  getPublicProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.communityService.getPublicProject(id);
  }

  @Get(':id/comments')
  listComments(@Param('id', ParseUUIDPipe) id: string) {
    return this.communityService.listComments(id);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.communityService.addComment(user.id, id, dto.content);
  }
}
