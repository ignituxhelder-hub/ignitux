import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PutRegistrationDto } from './dto/immatriculation.dto.js';
import { ImmatriculationService } from './immatriculation.service.js';

@ApiTags('immatriculation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/immatriculation')
export class ImmatriculationController {
  constructor(private readonly immatriculationService: ImmatriculationService) {}

  @Get()
  obtenir(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.immatriculationService.obtenir(user.id, projectId);
  }

  @Put()
  enregistrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: PutRegistrationDto,
  ) {
    return this.immatriculationService.enregistrer(user.id, projectId, {
      siren: dto.siren,
      siret: dto.siret,
      vatNumber: dto.vatNumber,
      legalName: dto.legalName,
      headOffice: dto.headOffice,
      registeredOn: dto.registeredOn,
    });
  }

  @Delete()
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.immatriculationService.supprimer(user.id, projectId);
  }

  @Get('capital')
  obtenirCapital(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.immatriculationService.obtenirCapital(user.id, projectId);
  }

  /** Jamais appelé en arrière-plan : l'interface demande une confirmation explicite. */
  @Post('capital')
  enregistrerCapital(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.immatriculationService.enregistrerCapital(user.id, projectId);
  }
}
