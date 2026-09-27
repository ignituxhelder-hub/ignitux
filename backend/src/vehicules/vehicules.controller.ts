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
import { VehiculesService } from './vehicules.service.js';
import { CreateVehicleDto, RecordVehicleEntryDto, UpdateVehicleDto } from './dto/vehicules.dto.js';

@ApiTags('vehicules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicules')
export class VehiculesController {
  constructor(private readonly vehiculesService: VehiculesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVehicleDto) {
    return this.vehiculesService.createVehicle(user.id, { label: dto.label, plate: dto.plate });
  }

  @Get()
  listVehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.vehiculesService.listVehicles(user.id);
  }

  @Patch(':id')
  updateVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiculesService.updateVehicle(user.id, id, { label: dto.label, plate: dto.plate });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVehicle(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiculesService.deleteVehicle(user.id, id);
  }

  @Post(':id/entretien')
  @HttpCode(HttpStatus.CREATED)
  recordEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordVehicleEntryDto,
  ) {
    return this.vehiculesService.recordEntry(user.id, id, {
      costCents: dto.costCents,
      odometerKm: dto.odometerKm,
      reason: dto.reason,
      occurredOn: dto.occurredOn ? new Date(dto.occurredOn) : undefined,
    });
  }

  @Get(':id/entretien')
  listEntries(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiculesService.listEntries(user.id, id);
  }
}
