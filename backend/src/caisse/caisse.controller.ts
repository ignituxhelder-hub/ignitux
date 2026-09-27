import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
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
  recordDay(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordCaisseDayDto) {
    return this.caisseService.recordDay(user.id, {
      occurredOn: new Date(dto.occurredOn),
      cashCents: dto.cashCents,
      cardCents: dto.cardCents,
      vatCents: dto.vatCents,
      note: dto.note,
    });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.caisseService.list(user.id);
  }
}
