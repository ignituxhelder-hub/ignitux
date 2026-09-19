import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  isCrmChannel,
  isCrmKind,
  isCrmStage,
  type CrmChannel,
  type CrmKind,
  type CrmStage,
} from './crm-pipeline.js';
import { CrmService } from './crm.service.js';
import {
  CreateCompanyDto,
  CreateContactDto,
  LogInteractionDto,
  UpdateContactDto,
} from './dto/crm.dto.js';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post('companies')
  @HttpCode(HttpStatus.CREATED)
  createCompany(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCompanyDto) {
    return this.crmService.createCompany(user.id, dto.name, dto.sector, dto.website, dto.notes);
  }

  @Get('companies')
  listCompanies(@CurrentUser() user: AuthenticatedUser) {
    return this.crmService.listCompanies(user.id);
  }

  @Patch('companies/:id')
  updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.crmService.updateCompany(user.id, id, dto);
  }

  @Delete('companies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.crmService.deleteCompany(user.id, id);
  }

  @Post('contacts')
  @HttpCode(HttpStatus.CREATED)
  createContact(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto) {
    return this.crmService.createContact(user.id, this.toContactInput(dto));
  }

  @Get('contacts')
  listContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('stage') stage?: string,
    @Query('kind') kind?: string,
    @Query('companyId') companyId?: string,
    @Query('projectId') projectId?: string,
  ) {
    // Un filtre mal formé est ignoré plutôt que rejeté : une recherche qui
    // renvoie 400 parce qu'une étape a été mal orthographiée dans l'URL
    // n'aide personne.
    return this.crmService.listContacts(user.id, {
      query,
      stage: stage && isCrmStage(stage) ? stage : undefined,
      kind: kind && isCrmKind(kind) ? kind : undefined,
      companyId,
      projectId,
    });
  }

  @Get('pipeline')
  getPipeline(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.crmService.getPipeline(user.id, projectId);
  }

  @Get('contacts/:id')
  getContact(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.crmService.getContact(user.id, id);
  }

  @Patch('contacts/:id')
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.crmService.updateContact(user.id, id, this.toContactInput(dto));
  }

  @Delete('contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.crmService.deleteContact(user.id, id);
  }

  @Post('contacts/:id/interactions')
  @HttpCode(HttpStatus.CREATED)
  logInteraction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogInteractionDto,
  ) {
    // Garde redondante avec @IsIn du DTO, et c'est voulu : le service ne
    // doit pas dépendre du fait que la validation HTTP a bien tourné.
    const channel: CrmChannel = isCrmChannel(dto.channel) ? dto.channel : 'note';

    return this.crmService.logInteraction(
      user.id,
      id,
      channel,
      dto.summary,
      dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    );
  }

  @Get('contacts/:id/interactions')
  listInteractions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crmService.listInteractions(user.id, id);
  }

  @Delete('interactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInteraction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.crmService.deleteInteraction(user.id, id);
  }

  /**
   * Les DTO valident les chaînes ; ce passage restreint les types pour le
   * service. Les gardes sont redondantes avec @IsIn, et c'est voulu : le
   * jour où quelqu'un appelle le service sans passer par le contrôleur,
   * rien ne doit pouvoir y entrer une étape inconnue.
   */
  private toContactInput(dto: CreateContactDto | UpdateContactDto) {
    // Champs recopiés un par un plutôt que par spread : le DTO est une
    // instance de classe (class-validator), et l'étaler perdrait son
    // prototype tout en laissant passer d'éventuels champs non validés.
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role,
      notes: dto.notes,
      companyId: dto.companyId,
      projectId: dto.projectId,
      kind: dto.kind && isCrmKind(dto.kind) ? (dto.kind as CrmKind) : undefined,
      stage: dto.stage && isCrmStage(dto.stage) ? (dto.stage as CrmStage) : undefined,
    };
  }
}
