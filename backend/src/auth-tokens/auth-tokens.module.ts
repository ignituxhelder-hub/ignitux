import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { AuthTokenService } from './auth-token.service.js';
import { AuthTokensController } from './auth-tokens.controller.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';

@Module({
  imports: [MailModule],
  controllers: [AuthTokensController],
  providers: [AuthTokenService, PasswordResetService, EmailVerificationService],
  exports: [EmailVerificationService],
})
export class AuthTokensModule {}
