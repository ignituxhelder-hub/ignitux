import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ComplianceService } from './compliance.service.js';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('compliance/requirements')
  listRequirements(@Query('country') country?: string) {
    return this.complianceService.listRequirements(country);
  }

  @Get('projects/:id/compliance')
  listForProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('country') country?: string,
  ) {
    return this.complianceService.listForProject(user.id, id, country);
  }

  @Post('projects/:id/compliance/:requirementId/check')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markChecked(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    await this.complianceService.markChecked(user.id, id, requirementId);
  }

  @Delete('projects/:id/compliance/:requirementId/check')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unmarkChecked(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    await this.complianceService.unmarkChecked(user.id, id, requirementId);
  }
}
