import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { RefuserEcritureDepassee } from '../hors-ligne/ecriture-depassee.decorator.js';
import { EcritureDepasseeGuard } from '../hors-ligne/ecriture-depassee.guard.js';
import {
  isDocumentStatus,
  isDocumentType,
  isPaymentMethod,
  type DocumentStatus,
  type DocumentType,
  type PaymentMethod,
} from './billing-rules.js';
import { BillingService } from './billing.service.js';
import {
  AddPaymentDto,
  ChangeStatusDto,
  CreateDocumentDto,
  UpdateDraftDto,
} from './dto/billing.dto.js';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, EcritureDepasseeGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('legal-notice')
  getLegalNotice() {
    return this.billingService.getLegalNotice();
  }

  @Get('documents')
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.billingService.listDocuments(user.id, {
      type: type && isDocumentType(type) ? type : undefined,
      status: status && isDocumentStatus(status) ? status : undefined,
    });
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  createDocument(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDocumentDto) {
    return this.billingService.createDocument(user.id, {
      type: dto.type as DocumentType,
      clientName: dto.clientName,
      clientDetails: dto.clientDetails,
      contactId: dto.contactId,
      projectId: dto.projectId,
      notes: dto.notes,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      correctsId: dto.correctsId,
      lines: dto.lines,
    });
  }

  /**
   * L'export arrive avant `documents/:id` : sans cet ordre, Nest ferait
   * correspondre « export » à un identifiant et renverrait une erreur de
   * validation d'UUID au lieu du fichier.
   */
  @Get('documents/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ignitux-facturation.csv"')
  exportCsv(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.exportCsv(user.id);
  }

  @Get('documents/:id')
  getDocument(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.getDocument(user.id, id);
  }

  @RefuserEcritureDepassee('billing_documents')
  @Patch('documents/:id')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.billingService.updateDraft(user.id, id, {
      clientName: dto.clientName,
      clientDetails: dto.clientDetails,
      notes: dto.notes,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      lines: dto.lines,
    });
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.billingService.deleteDraft(user.id, id);
  }

  @RefuserEcritureDepassee('billing_documents')
  @Patch('documents/:id/status')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.billingService.changeStatus(user.id, id, dto.status as DocumentStatus);
  }

  @Post('documents/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  addPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ) {
    const method: PaymentMethod = isPaymentMethod(dto.method) ? dto.method : 'autre';

    return this.billingService.addPayment(
      user.id,
      id,
      dto.amountCents,
      method,
      dto.receivedAt ? new Date(dto.receivedAt) : undefined,
      dto.note,
    );
  }
}
