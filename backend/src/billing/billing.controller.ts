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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Espace, HorsEspace } from '../equipe/espace.decorator.js';
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
  @HorsEspace()
  getLegalNotice() {
    return this.billingService.getLegalNotice();
  }

  @Get('documents')
  listDocuments(
    @Espace('argent') ownerId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.billingService.listDocuments(ownerId, {
      type: type && isDocumentType(type) ? type : undefined,
      status: status && isDocumentStatus(status) ? status : undefined,
    });
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  createDocument(@Espace('argent') ownerId: string, @Body() dto: CreateDocumentDto) {
    return this.billingService.createDocument(ownerId, {
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
  exportCsv(@Espace('argent') ownerId: string) {
    return this.billingService.exportCsv(ownerId);
  }

  @Get('documents/:id')
  getDocument(@Espace('argent') ownerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.getDocument(ownerId, id);
  }

  @RefuserEcritureDepassee('billing_documents')
  @Patch('documents/:id')
  updateDraft(
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.billingService.updateDraft(ownerId, id, {
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
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.billingService.deleteDraft(ownerId, id);
  }

  @RefuserEcritureDepassee('billing_documents')
  @Patch('documents/:id/status')
  changeStatus(
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.billingService.changeStatus(ownerId, id, dto.status as DocumentStatus);
  }

  @Post('documents/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  addPayment(
    @Espace('argent') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ) {
    const method: PaymentMethod = isPaymentMethod(dto.method) ? dto.method : 'autre';

    return this.billingService.addPayment(
      ownerId,
      id,
      dto.amountCents,
      method,
      dto.receivedAt ? new Date(dto.receivedAt) : undefined,
      dto.note,
    );
  }
}
