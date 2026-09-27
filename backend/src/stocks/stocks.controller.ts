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
import {
  CreateStockItemDto,
  RecordStockMovementDto,
  UpdateStockItemDto,
} from './dto/stocks.dto.js';
import { StocksService } from './stocks.service.js';

@ApiTags('stocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockItemDto) {
    return this.stocksService.createItem(user.id, {
      projectId: dto.projectId,
      name: dto.name,
      unit: dto.unit,
      alertBelow: dto.alertBelow,
    });
  }

  @Get()
  listItems(@CurrentUser() user: AuthenticatedUser) {
    return this.stocksService.listItems(user.id);
  }

  @Patch(':id')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockItemDto,
  ) {
    return this.stocksService.updateItem(user.id, id, {
      projectId: dto.projectId,
      name: dto.name,
      unit: dto.unit,
      alertBelow: dto.alertBelow,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stocksService.deleteItem(user.id, id);
  }

  @Post(':id/mouvements')
  @HttpCode(HttpStatus.CREATED)
  recordMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordStockMovementDto,
  ) {
    return this.stocksService.recordMovement(user.id, id, {
      quantity: dto.quantity,
      reason: dto.reason,
      occurredOn: dto.occurredOn ? new Date(dto.occurredOn) : undefined,
    });
  }

  @Get(':id/mouvements')
  listMovements(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stocksService.listMovements(user.id, id);
  }
}
