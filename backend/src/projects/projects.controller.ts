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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AddCollaboratorDto } from './dto/add-collaborator.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { UpdateSectorDto } from './dto/update-sector.dto.js';
import { UpdateVisibilityDto } from './dto/update-visibility.dto.js';
import { ProjectsService } from './projects.service.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.id, dto.title, dto.description);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAllForOwner(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOneForViewer(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.updateForOwner(user.id, id, dto.title, dto.description);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.projectsService.deleteForOwner(user.id, id);
  }

  @Patch(':id/secteur')
  updateSector(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectorDto,
  ) {
    return this.projectsService.setSectorForOwner(user.id, id, dto.sector ?? null);
  }

  @Patch(':id/visibility')
  updateVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    return this.projectsService.setVisibilityForOwner(user.id, id, dto.isPublic);
  }

  @Get(':id/collaborators')
  listCollaborators(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listCollaborators(user.id, id);
  }

  @Post(':id/collaborators')
  @HttpCode(HttpStatus.CREATED)
  addCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCollaboratorDto,
  ) {
    return this.projectsService.addCollaborator(user.id, id, dto.email);
  }

  @Delete(':id/collaborators/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) collaboratorUserId: string,
  ) {
    await this.projectsService.removeCollaborator(user.id, id, collaboratorUserId);
  }

  @Post(':id/analyze')
  @HttpCode(HttpStatus.CREATED)
  // Chaque appel coûte un appel API Claude — limite dédiée contre les abus.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  analyze(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.analyzeForOwner(user.id, id);
  }

  @Get(':id/analyses')
  listAnalyses(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listAnalysesForOwner(user.id, id);
  }

  @Post(':id/plan')
  @HttpCode(HttpStatus.CREATED)
  // Chaque appel coûte un appel API Claude — limite dédiée contre les abus.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createBuildPlan(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.createBuildPlanForOwner(user.id, id);
  }

  @Get(':id/plans')
  listBuildPlans(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listBuildPlansForOwner(user.id, id);
  }

  @Post(':id/financing-plan')
  @HttpCode(HttpStatus.CREATED)
  // Chaque appel coûte un appel API Claude — limite dédiée contre les abus.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createFinancingPlan(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.createFinancingPlanForOwner(user.id, id);
  }

  @Get(':id/financing-plans')
  listFinancingPlans(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listFinancingPlansForOwner(user.id, id);
  }

  @Post(':id/development-plan')
  @HttpCode(HttpStatus.CREATED)
  // Chaque appel coûte un appel API Claude — limite dédiée contre les abus.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createDevelopmentPlan(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.createDevelopmentPlanForOwner(user.id, id);
  }

  @Get(':id/development-plans')
  listDevelopmentPlans(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listDevelopmentPlansForOwner(user.id, id);
  }

  @Post(':id/transmission-plan')
  @HttpCode(HttpStatus.CREATED)
  // Chaque appel coûte un appel API Claude — limite dédiée contre les abus.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createTransmissionPlan(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.createTransmissionPlanForOwner(user.id, id);
  }

  @Get(':id/transmission-plans')
  listTransmissionPlans(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listTransmissionPlansForOwner(user.id, id);
  }

  @Post(':id/automation/run')
  @HttpCode(HttpStatus.CREATED)
  runAutomation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.runAutomationForOwner(user.id, id);
  }

  @Get(':id/automation/runs')
  listAutomationRuns(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listAutomationRunsForViewer(user.id, id);
  }
}
