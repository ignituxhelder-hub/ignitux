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
  // AuthTokenService est aussi exporté : AuthModule s'en sert pour émettre
  // et consommer les jetons de rafraîchissement (purpose 'refresh'), même
  // mécanisme que la réinitialisation de mot de passe.
  exports: [EmailVerificationService, AuthTokenService],
})
export class AuthTokensModule {}
