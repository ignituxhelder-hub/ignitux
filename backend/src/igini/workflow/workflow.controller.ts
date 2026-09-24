import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RefuserEcritureDepassee } from '../../hors-ligne/ecriture-depassee.decorator.js';
import { EcritureDepasseeGuard } from '../../hors-ligne/ecriture-depassee.guard.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import { WorkflowService } from './workflow.service.js';

@ApiTags('igini-workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, EcritureDepasseeGuard)
@Controller()
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('projects/:projectId/tasks')
  @HttpCode(HttpStatus.CREATED)
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.workflowService.createTask(user.id, projectId, dto.title, dto.description, dto.assignee);
  }

  @Get('projects/:projectId/tasks')
  listTasks(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.workflowService.listTasks(user.id, projectId);
  }

  @RefuserEcritureDepassee('tasks', 'taskId')
  @Patch('tasks/:taskId/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.workflowService.updateStatus(user.id, taskId, dto.status);
  }
}
