import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CorrectMovementDto,
  DistributionDto,
  DividendDto,
  OpenFinancingDto,
  RecordParticipationDto,
  RegisterInvestorDto,
} from './dto/investors.dto.js';
import { InvestorsService } from './investors.service.js';

/**
 * CE QUE VOIT UN INVESTISSEUR : ses investissements, et rien d'autre.
 *
 * Chaque route derive l'investisseur du jeton, jamais d'un parametre. Il
 * n'existe donc aucune requete capable de designer le portefeuille de
 * quelqu'un d'autre : ce n'est pas qu'elle serait refusee, c'est qu'elle ne
 * peut pas s'ecrire.
 */
@ApiTags('investisseurs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('investisseurs')
export class InvestorsController {
  constructor(private readonly investors: InvestorsService) {}

  @Post()
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterInvestorDto) {
    return this.investors.registerInvestor(user.id, dto);
  }

  @Get('moi')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.investors.myInvestor(user.id);
  }

  /** Vue globale ET detail projet par projet, sans jamais les additionner entre eux. */
  @Get('moi/portefeuille')
  async portfolio(@CurrentUser() user: AuthenticatedUser) {
    const investor = await this.investors.myInvestor(user.id);
    return this.investors.portfolio(investor.id);
  }

  @Get('moi/participations')
  async participations(@CurrentUser() user: AuthenticatedUser) {
    const investor = await this.investors.myInvestor(user.id);
    return this.investors.listParticipations(investor.id);
  }

  @Get('moi/participations/:id')
  async participation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const investor = await this.investors.myInvestor(user.id);
    return this.investors.participationDetail(investor.id, id);
  }

  /** L'historique complet sur UN projet, consultable independamment. */
  @Get('moi/projets/:financedProjectId')
  async projectHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('financedProjectId', ParseUUIDPipe) financedProjectId: string,
  ) {
    const investor = await this.investors.myInvestor(user.id);
    return this.investors.projectHistory(investor.id, financedProjectId);
  }
}

/**
 * CE QUE FAIT LE PORTEUR : ouvrir son projet au financement, enregistrer les
 * apports, repartir les versements.
 *
 * Toutes ces routes passent par le controle de propriete du projet. Un
 * investisseur n'y a pas acces : il consulte, il ne repartit pas.
 */
@ApiTags('investisseurs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FinancedProjectsController {
  constructor(private readonly investors: InvestorsService) {}

  @Post('projets-finances')
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenFinancingDto) {
    return this.investors.openFinancing(user.id, {
      projectId: dto.projectId,
      openedOn: new Date(dto.openedOn),
      targetCents: dto.targetCents,
      note: dto.note,
    });
  }

  /** Le registre financier du projet : participations, mouvements, totaux. */
  @Get('projets-finances/:id')
  register(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.investors.projectRegister(user.id, id);
  }

  @Post('projets-finances/:id/participations')
  participate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordParticipationDto,
  ) {
    return this.investors.recordParticipation(user.id, id, {
      investorId: dto.investorId,
      investedCents: dto.investedCents,
      occurredOn: new Date(dto.occurredOn),
      shareBasisPointsGranted: dto.shareBasisPointsGranted,
      equityHolderId: dto.equityHolderId,
      note: dto.note,
    });
  }

  @Post('projets-finances/:id/remboursements')
  repay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DistributionDto,
  ) {
    return this.investors.distributeRepayment(user.id, id, {
      amountCents: dto.amountCents,
      occurredOn: new Date(dto.occurredOn),
      reference: dto.reference,
      note: dto.note,
    });
  }

  @Post('projets-finances/:id/dividendes')
  dividend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DividendDto,
  ) {
    return this.investors.distributeDividend(user.id, id, {
      amountCents: dto.amountCents,
      occurredOn: new Date(dto.occurredOn),
      reference: dto.reference,
      note: dto.note,
      applyPerpetualShare: dto.applyPerpetualShare,
    });
  }

  @Post('projets-finances/:id/gains')
  gain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DistributionDto,
  ) {
    return this.investors.distributeGain(user.id, id, {
      amountCents: dto.amountCents,
      occurredOn: new Date(dto.occurredOn),
      reference: dto.reference,
      note: dto.note,
    });
  }

  /**
   * La SEULE facon d'annuler quoi que ce soit.
   *
   * Il n'existe aucune route de suppression dans ce module, et ce n'est pas
   * un oubli : un historique d'investissement qu'on peut reecrire ne prouve
   * rien.
   */
  @Post('mouvements-investisseurs/:id/correction')
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectMovementDto,
  ) {
    return this.investors.correctMovement(user.id, id, {
      amountCents: dto.amountCents,
      occurredOn: new Date(dto.occurredOn),
      note: dto.note,
    });
  }
}
