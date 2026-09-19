import {
  BadRequestException,
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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  BUYBACK_CONDITIONS,
  isBuybackCondition,
  type BuybackCondition,
} from './buyback-progress.js';
import {
  AddHolderDto,
  DeclareBuybackObjectiveDto,
  RecordDividendDto,
  RecordEquityChangeDto,
  RecordRoundDto,
  SetBuybackObjectiveDto,
} from './dto/financing.dto.js';
import { isFinancingSource, type FinancingSource } from './financing-model.js';
import { FinancingService } from './financing.service.js';

@ApiTags('financing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FinancingController {
  constructor(private readonly financingService: FinancingService) {}

  @Get('financing/scope')
  getScopeNotice() {
    return this.financingService.getScopeNotice();
  }

  @Get('projects/:projectId/financing/rounds')
  listRounds(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.financingService.listRounds(user.id, projectId);
  }

  @Post('projects/:projectId/financing/rounds')
  @HttpCode(HttpStatus.CREATED)
  recordRound(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RecordRoundDto,
  ) {
    // Garde redondante avec @IsIn, comme ailleurs : le service ne doit pas
    // supposer que la validation HTTP a tourné.
    const source: FinancingSource = isFinancingSource(dto.source) ? dto.source : 'autre';

    return this.financingService.recordRound(
      user.id,
      projectId,
      source,
      dto.amountCents,
      new Date(dto.occurredAt),
      dto.note,
    );
  }

  @Delete('financing/rounds/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRound(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.financingService.deleteRound(user.id, id);
  }

  @Get('projects/:projectId/financing/cap-table')
  getCapTable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.financingService.getCapTable(user.id, projectId);
  }

  @Post('projects/:projectId/financing/holders')
  @HttpCode(HttpStatus.CREATED)
  addHolder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddHolderDto,
  ) {
    return this.financingService.addHolder(user.id, projectId, dto.name, dto.isFounder ?? false);
  }

  @Delete('financing/holders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeHolder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.financingService.removeHolder(user.id, id);
  }

  @Post('financing/holders/:id/equity-events')
  @HttpCode(HttpStatus.CREATED)
  recordEquityChange(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordEquityChangeDto,
  ) {
    return this.financingService.recordEquityChange(
      user.id,
      id,
      dto.shareBasisPoints,
      dto.reason,
      new Date(dto.occurredAt),
    );
  }

  @Get('projects/:projectId/financing/equity-events')
  listEquityEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.financingService.listEquityEvents(user.id, projectId);
  }

  @Post('financing/holders/:id/dividends')
  @HttpCode(HttpStatus.CREATED)
  recordDividend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDividendDto,
  ) {
    return this.financingService.recordDividend(
      user.id,
      id,
      dto.amountCents,
      new Date(dto.occurredAt),
      dto.note,
    );
  }

  @Get('projects/:projectId/financing/dividends')
  listDividends(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.financingService.listDividends(user.id, projectId);
  }

  // ------------------------------------------------- rachat progressif

  @Get('projects/:projectId/financing/buyback')
  getBuybackProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.financingService.getBuybackProgress(user.id, projectId);
  }

  @Put('projects/:projectId/financing/buyback')
  setBuybackObjective(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SetBuybackObjectiveDto,
  ) {
    return this.financingService.setBuybackObjective(
      user.id,
      projectId,
      dto.kind as BuybackCondition,
      dto.definition,
    );
  }

  @Patch('projects/:projectId/financing/buyback/:kind')
  declareBuybackObjective(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('kind') kind: string,
    @Body() dto: DeclareBuybackObjectiveDto,
  ) {
    if (!isBuybackCondition(kind)) {
      throw new BadRequestException(
        `kind doit être l'une de : ${BUYBACK_CONDITIONS.join(', ')}.`,
      );
    }
    return this.financingService.declareBuybackObjective(
      user.id,
      projectId,
      kind,
      dto.reachedAt,
      dto.evidence,
    );
  }
}
