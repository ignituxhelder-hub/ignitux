import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import {
  CreateWorkflowDto,
  CreateWorkflowFromTemplateDto,
} from './dto/create-workflow.dto.js';
import { WorkflowEngineService } from './workflow-engine.service.js';

@ApiTags('igini-workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WorkflowEngineController {
  constructor(private readonly engine: WorkflowEngineService) {}

  @Get('workflows/templates')
  listTemplates() {
    return this.engine.listTemplates();
  }

  @Get('projects/:projectId/workflows')
  listWorkflows(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.engine.listWorkflows(user.id, projectId);
  }

  @Post('projects/:projectId/workflows')
  @HttpCode(HttpStatus.CREATED)
  createWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.engine.createWorkflow(user.id, projectId, dto.name, dto.description, dto.steps);
  }

  @Post('projects/:projectId/workflows/from-template')
  @HttpCode(HttpStatus.CREATED)
  createFromTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWorkflowFromTemplateDto,
  ) {
    return this.engine.createFromTemplate(user.id, projectId, dto.slug);
  }

  @Delete('workflows/:workflowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
  ) {
    await this.engine.deleteWorkflow(user.id, workflowId);
  }

  @Post('workflows/:workflowId/runs')
  @HttpCode(HttpStatus.CREATED)
  startRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
  ) {
    return this.engine.startRun(user.id, workflowId);
  }

  @Post('workflow-runs/:runId/advance')
  advanceRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.engine.advanceRun(user.id, runId);
  }

  @Post('workflow-runs/:runId/steps/:position/confirm')
  confirmStep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('position', ParseIntPipe) position: number,
  ) {
    return this.engine.confirmStep(user.id, runId, position);
  }

  @Get('workflow-runs/:runId/events')
  listEvents(@CurrentUser() user: AuthenticatedUser, @Param('runId', ParseUUIDPipe) runId: string) {
    return this.engine.listEvents(user.id, runId);
  }
}
