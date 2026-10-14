import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Espace } from '../equipe/espace.decorator.js';
import { CaisseService } from './caisse.service.js';
import { RecordCaisseDayDto } from './dto/caisse.dto.js';

@ApiTags('caisse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('caisse/journees')
export class CaisseController {
  constructor(private readonly caisseService: CaisseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  recordDay(@Espace('argent') ownerId: string, @Body() dto: RecordCaisseDayDto) {
    return this.caisseService.recordDay(ownerId, {
      occurredOn: new Date(dto.occurredOn),
      cashCents: dto.cashCents,
      cardCents: dto.cardCents,
      vatCents: dto.vatCents,
      note: dto.note,
    });
  }

  @Get()
  list(@Espace('argent') ownerId: string) {
    return this.caisseService.list(ownerId);
  }
}
