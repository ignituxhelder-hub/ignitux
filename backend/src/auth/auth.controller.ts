import { Body, Controller, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordDto } from '../users/dto/change-password.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Limite stricte contre le bruteforce : 5 tentatives / minute / IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Patch('me/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
