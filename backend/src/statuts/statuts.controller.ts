import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GenerateBylawsDto, UpdateBylawsContentDto } from './dto/statuts.dto.js';
import { StatutsService } from './statuts.service.js';

@ApiTags('statuts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/statuts')
export class StatutsController {
  constructor(private readonly statutsService: StatutsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  generer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: GenerateBylawsDto,
  ) {
    return this.statutsService.genererPourProjet(user.id, projectId, dto);
  }

  @Patch()
  modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateBylawsContentDto,
  ) {
    return this.statutsService.modifierTexte(user.id, projectId, dto.content);
  }

  @Post('regenerer')
  regenerer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: GenerateBylawsDto,
  ) {
    return this.statutsService.regenererPourProjet(user.id, projectId, dto);
  }
}
