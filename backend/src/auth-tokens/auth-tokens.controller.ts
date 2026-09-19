import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthTokensController {
  constructor(
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  // Meme limite que login/signup contre l'abus ; renvoie toujours 204, que
  // l'email existe ou non (voir PasswordResetService.requestReset).
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordResetService.requestReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const success = await this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    if (!success) {
      throw new BadRequestException('Ce lien est invalide, expiré, ou déjà utilisé.');
    }
    return { success: true };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const success = await this.emailVerificationService.verifyEmail(dto.token);
    if (!success) {
      throw new BadRequestException('Ce lien est invalide, expiré, ou déjà utilisé.');
    }
    return { success: true };
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.emailVerificationService.resendVerification(dto.email);
  }
}
