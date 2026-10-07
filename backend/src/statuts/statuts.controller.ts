import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GenerateBylawsDto, UpdateBylawsContentDto } from './dto/statuts.dto.js';
import { genererPdfStatuts } from './bylaws-pdf.js';
import { StatutsService } from './statuts.service.js';

@ApiTags('statuts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/statuts')
export class StatutsController {
  constructor(private readonly statutsService: StatutsService) {}

  @Get()
  obtenir(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.statutsService.obtenirPourProjet(user.id, projectId);
  }

  @Post('retenir')
  retenir(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.statutsService.retenirPourProjet(user.id, projectId);
  }

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

  @Get('pdf')
  async telechargerPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Res() res: Response,
  ) {
    const bylaws = await this.statutsService.obtenirPourProjet(user.id, projectId);
    if (!bylaws) {
      throw new NotFoundException('Statuts introuvables pour ce projet.');
    }
    const pdf = await genererPdfStatuts(bylaws.content, { brouillon: bylaws.status !== 'retenue' });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="statuts.pdf"',
      'Cache-Control': 'no-store',
    });
    res.send(pdf);
  }
}
