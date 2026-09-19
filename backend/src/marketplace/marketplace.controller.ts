import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';
import { MarketplaceService } from './marketplace.service.js';
import type { MarketplaceRole } from './marketplace-role.js';

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('profiles')
  listProfiles(@Query('role') role?: MarketplaceRole) {
    return this.marketplaceService.listProfiles(role);
  }

  @Get('profile')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.marketplaceService.getOwnProfile(user.id);
  }

  @Post('profile')
  upsertProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertProfileDto) {
    return this.marketplaceService.upsertProfile(user.id, dto.role, dto.headline, dto.bio, dto.expertise);
  }

  @Delete('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    await this.marketplaceService.removeOwnProfile(user.id);
  }

  @Post('profiles/:id/contact')
  @HttpCode(HttpStatus.CREATED)
  contactProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.marketplaceService.contactProfile(user.id, id, dto.message);
  }

  @Get('contacts')
  listReceivedContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.marketplaceService.listReceivedContacts(user.id);
  }
}
