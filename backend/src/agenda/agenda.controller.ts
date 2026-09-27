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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AgendaService } from './agenda.service.js';
import { CreateAgendaEventDto, UpdateAgendaEventDto } from './dto/agenda.dto.js';

@ApiTags('agenda')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createEvent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAgendaEventDto) {
    return this.agendaService.createEvent(user.id, {
      projectId: dto.projectId,
      contactId: dto.contactId,
      title: dto.title,
      location: dto.location,
      note: dto.note,
      occurredAt: new Date(dto.occurredAt),
    });
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('depuis') depuis?: string,
    @Query('jusqua') jusqua?: string,
  ) {
    return this.agendaService.list(user.id, {
      depuis: depuis ? new Date(depuis) : undefined,
      jusqua: jusqua ? new Date(jusqua) : undefined,
    });
  }

  @Patch(':id')
  updateEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgendaEventDto,
  ) {
    return this.agendaService.updateEvent(user.id, id, {
      projectId: dto.projectId,
      contactId: dto.contactId,
      title: dto.title,
      location: dto.location,
      note: dto.note,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.agendaService.deleteEvent(user.id, id);
  }
}
