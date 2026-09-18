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
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
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
    return this.projectsService.findOneForOwner(user.id, id);
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
}
