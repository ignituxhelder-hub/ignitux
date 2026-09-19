import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmailVerificationService } from '../auth-tokens/email-verification.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  // Limite contre les inscriptions automatisées : 5 tentatives / minute / IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async signup(@Body() dto: SignupDto) {
    const user = await this.usersService.signup(dto.email, dto.password);
    // Ne bloque jamais l'inscription si l'envoi echoue (aucun vrai
    // fournisseur d'email n'est configure pour l'instant, voir MailService) —
    // le compte doit rester utilisable meme sans verification immediate.
    await this.emailVerificationService.sendVerification(user.id, user.email);
    return user;
  }
}
