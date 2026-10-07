import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  AddMilestoneDto,
  CreateAgreementDto,
  ExecuteMilestoneDto,
  RecordDistributedDividendDto,
  SettleDividendRightDto,
  ValidateMilestoneDto,
} from './dto/participation.dto.js';
import { estOperateurIgnitux } from './operateurs.js';
import { ParticipationService } from './participation.service.js';

/**
 * Les routes d'écriture « côté IGNITUX » reçoivent l'utilisateur complet : le
 * service décide, d'après son e-mail, s'il parle pour IGNITUX. Le contrôleur
 * ne filtre rien lui-même — une règle de sécurité qui vivrait à deux endroits
 * finirait par n'être appliquée qu'à un seul.
 */
@ApiTags('participation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ParticipationController {
  constructor(private readonly participationService: ParticipationService) {}

  @Get('projects/:projectId/participation')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    const participation = await this.participationService.getParticipation(user.id, projectId);
    // Pour que l'écran sache quels boutons proposer. Ce n'est qu'un
    // affichage : chaque écriture est revérifiée par le service.
    return { ...participation, viewer: { isIgnituxOperator: estOperateurIgnitux(user.email) } };
  }

  @Post('projects/:projectId/participation/agreement')
  @HttpCode(HttpStatus.CREATED)
  createAgreement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateAgreementDto,
  ) {
    return this.participationService.createAgreement(user, projectId, {
      founderName: dto.founderName,
      effectiveOn: new Date(dto.effectiveOn),
      founderBasisPoints: dto.founderBasisPoints,
      ignituxBasisPoints: dto.ignituxBasisPoints,
      dividendRightBasisPoints: dto.dividendRightBasisPoints,
      ecosystemOffre: dto.ecosystemOffre,
      contractReference: dto.contractReference,
    });
  }

  @Post('projects/:projectId/participation/milestones')
  @HttpCode(HttpStatus.CREATED)
  addMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddMilestoneDto,
  ) {
    return this.participationService.addMilestone(user, projectId, {
      label: dto.label,
      targetIgnituxBasisPoints: dto.targetIgnituxBasisPoints,
      conditions: dto.conditions,
    });
  }

  @Post('participation/milestones/:id/validate')
  @HttpCode(HttpStatus.OK)
  validateMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateMilestoneDto,
  ) {
    return this.participationService.validateMilestone(user, id, dto.note);
  }

  @Post('participation/milestones/:id/execute')
  @HttpCode(HttpStatus.OK)
  executeMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExecuteMilestoneDto,
  ) {
    return this.participationService.executeMilestone(user, id, new Date(dto.effectiveOn));
  }

  @Post('participation/milestones/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledgeMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participationService.acknowledgeMilestone(user.id, id);
  }

  @Post('projects/:projectId/participation/dividends')
  @HttpCode(HttpStatus.CREATED)
  recordDividend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RecordDistributedDividendDto,
  ) {
    return this.participationService.recordDistributedDividend(user.id, projectId, {
      distributedCents: dto.distributedCents,
      occurredOn: new Date(dto.occurredOn),
      note: dto.note,
    });
  }

  @Post('participation/dividend-rights/:id/settle')
  @HttpCode(HttpStatus.OK)
  settleDividendRight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleDividendRightDto,
  ) {
    return this.participationService.settleDividendRight(user, id, new Date(dto.settledOn));
  }
}
