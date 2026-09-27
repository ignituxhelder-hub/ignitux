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
import { ImmobilierService } from './immobilier.service.js';
import {
  CreatePropertyDto,
  RecordPropertyMovementDto,
  UpdatePropertyDto,
} from './dto/immobilier.dto.js';

@ApiTags('immobilier')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('immobilier')
export class ImmobilierController {
  constructor(private readonly immobilierService: ImmobilierService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProperty(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePropertyDto) {
    return this.immobilierService.createProperty(user.id, {
      projectId: dto.projectId,
      label: dto.label,
      address: dto.address,
    });
  }

  @Get()
  listProperties(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilierService.listProperties(user.id);
  }

  @Patch(':id')
  updateProperty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.immobilierService.updateProperty(user.id, id, {
      projectId: dto.projectId,
      label: dto.label,
      address: dto.address,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProperty(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.immobilierService.deleteProperty(user.id, id);
  }

  @Post(':id/mouvements')
  @HttpCode(HttpStatus.CREATED)
  recordMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPropertyMovementDto,
  ) {
    return this.immobilierService.recordMovement(user.id, id, {
      amountCents: dto.amountCents,
      reason: dto.reason,
      occurredOn: dto.occurredOn ? new Date(dto.occurredOn) : undefined,
    });
  }

  @Get(':id/mouvements')
  listMovements(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.immobilierService.listMovements(user.id, id);
  }
}
