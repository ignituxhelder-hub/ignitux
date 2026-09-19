import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmailVerificationService } from '../auth-tokens/email-verification.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { SignupDto } from './dto/signup.dto.js';
import { UserDataService } from './user-data.service.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly userDataService: UserDataService,
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

  /**
   * Droit d'accès (RGPD art. 15). Renvoie du JSON plutôt qu'un format
   * propriétaire : lisible par un humain, relisible par une machine, et
   * réimportable ailleurs sans passer par Ignitux.
   */
  @Get('me/export')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  exportMyData(@CurrentUser() user: AuthenticatedUser) {
    return this.userDataService.exportUserData(user.id);
  }

  /**
   * Ce que la suppression détruira, consultable avant de la déclencher.
   * Article 8 de la Constitution : aucune action irréversible sans que la
   * personne ait pu voir ce qu'elle engage.
   */
  @Get('me/deletion-preview')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  previewDeletion(@CurrentUser() user: AuthenticatedUser) {
    return this.userDataService.previewDeletion(user.id);
  }

  /** Droit à l'effacement (RGPD art. 17). Exige le mot de passe. */
  @Delete('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  // Une suppression de compte n'a aucune raison d'être tentée en rafale.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async deleteMyAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.userDataService.deleteAccount(user.id, dto.password);
  }
}
