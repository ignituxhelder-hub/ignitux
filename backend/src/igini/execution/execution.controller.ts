import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RefuserEcritureDepassee } from '../../hors-ligne/ecriture-depassee.decorator.js';
import { EcritureDepasseeGuard } from '../../hors-ligne/ecriture-depassee.guard.js';
import { RefuseExecutionDto } from './dto/refuse-execution.dto.js';
import { ExecutionService } from './execution.service.js';

/**
 * Routes d'exécution par IGINI : lancer, valider ou refuser le travail d'une
 * tâche ou d'une exigence de conformité.
 *
 * `@RefuserEcritureDepassee` n'est posé que sur les tâches : `tasks` figure
 * dans les ressources datées. Les exigences de conformité n'y sont pas, donc
 * rien à comparer pour elles.
 */
@ApiTags('igini-execution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, EcritureDepasseeGuard)
@Controller()
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @RefuserEcritureDepassee('tasks', 'taskId')
  @Post('projects/:projectId/tasks/:taskId/run')
  @HttpCode(HttpStatus.OK)
  runTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.executionService.runTask(user.id, projectId, taskId);
  }

  @RefuserEcritureDepassee('tasks', 'taskId')
  @Post('projects/:projectId/tasks/:taskId/validate')
  @HttpCode(HttpStatus.OK)
  validateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.executionService.validateTask(user.id, projectId, taskId);
  }

  @RefuserEcritureDepassee('tasks', 'taskId')
  @Post('projects/:projectId/tasks/:taskId/refuse')
  @HttpCode(HttpStatus.OK)
  refuseTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto?: RefuseExecutionDto,
  ) {
    return this.executionService.refuseTask(user.id, projectId, taskId, dto?.reason);
  }

  @Post('projects/:projectId/compliance/:requirementId/run')
  @HttpCode(HttpStatus.OK)
  runCompliance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.executionService.runCompliance(user.id, projectId, requirementId);
  }

  @Post('projects/:projectId/compliance/:requirementId/validate')
  @HttpCode(HttpStatus.OK)
  validateCompliance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.executionService.validateCompliance(user.id, projectId, requirementId);
  }

  @Post('projects/:projectId/compliance/:requirementId/refuse')
  @HttpCode(HttpStatus.OK)
  refuseCompliance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body() dto?: RefuseExecutionDto,
  ) {
    return this.executionService.refuseCompliance(user.id, projectId, requirementId, dto?.reason);
  }
}
