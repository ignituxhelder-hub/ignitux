import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DossierCreationService } from './dossier-creation.service.js';
import { MarkDepositedDto, UpdateCheckedItemsDto } from './dto/dossier-creation.dto.js';

@ApiTags('dossier-creation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/dossier-creation')
export class DossierCreationController {
  constructor(private readonly dossierCreationService: DossierCreationService) {}

  @Get()
  obtenir(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dossierCreationService.obtenir(user.id, projectId);
  }

  @Patch()
  cocher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateCheckedItemsDto,
  ) {
    return this.dossierCreationService.cocher(user.id, projectId, dto.checkedItems);
  }

  @Post('depose')
  @HttpCode(HttpStatus.OK)
  deposer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: MarkDepositedDto,
  ) {
    return this.dossierCreationService.marquerDepose(user.id, projectId, dto.filingReference);
  }

  @Post('rouvrir')
  @HttpCode(HttpStatus.OK)
  rouvrir(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dossierCreationService.rouvrir(user.id, projectId);
  }

  @Get('pdf')
  async telechargerPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.dossierCreationService.recapitulatifPdf(user.id, projectId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="dossier-creation.pdf"',
      'Cache-Control': 'no-store',
    });
    res.send(pdf);
  }
}
