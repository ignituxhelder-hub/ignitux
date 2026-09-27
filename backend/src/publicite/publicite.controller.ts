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
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PubliciteService } from './publicite.service.js';
import { CreateCampaignDto, RecordCampaignEntryDto, UpdateCampaignDto } from './dto/publicite.dto.js';

@ApiTags('publicite')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('publicite')
export class PubliciteController {
  constructor(private readonly publiciteService: PubliciteService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createCampaign(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    return this.publiciteService.createCampaign(user.id, { label: dto.label, channel: dto.channel });
  }

  @Get()
  listCampaigns(@CurrentUser() user: AuthenticatedUser) {
    return this.publiciteService.listCampaigns(user.id);
  }

  @Patch(':id')
  updateCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.publiciteService.updateCampaign(user.id, id, { label: dto.label, channel: dto.channel });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCampaign(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publiciteService.deleteCampaign(user.id, id);
  }

  @Post(':id/entrees')
  @HttpCode(HttpStatus.CREATED)
  recordEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCampaignEntryDto,
  ) {
    return this.publiciteService.recordEntry(user.id, id, {
      spentCents: dto.spentCents,
      leads: dto.leads,
      note: dto.note,
      occurredOn: dto.occurredOn ? new Date(dto.occurredOn) : undefined,
    });
  }

  @Get(':id/entrees')
  listEntries(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publiciteService.listEntries(user.id, id);
  }
}
