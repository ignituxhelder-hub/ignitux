import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SignupDto } from './dto/signup.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  // Limite contre les inscriptions automatisées : 5 tentatives / minute / IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async signup(@Body() dto: SignupDto) {
    return this.usersService.signup(dto.email, dto.password);
  }
}
