import { Injectable } from '@nestjs/common';
import { getEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuthTokenService } from './auth-token.service.js';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    private readonly mailService: MailService,
  ) {}

  async sendVerification(userId: string, email: string): Promise<void> {
    const token = await this.authTokenService.issue(userId, 'email_verification', EMAIL_VERIFICATION_TTL_MS);
    const verifyUrl = `${getEnv().FRONTEND_URL}/verify-email?token=${token}`;

    await this.mailService.send({
      to: email,
      subject: 'Confirme ton email Ignitux',
      text: `Clique sur ce lien pour confirmer ton email (valable 24 heures) : ${verifyUrl}`,
    });
  }

  /** Renvoie true si l'email a bien été vérifié, false si le token est invalide/expiré/déjà utilisé. */
  async verifyEmail(token: string): Promise<boolean> {
    const userId = await this.authTokenService.consume(token, 'email_verification');
    if (!userId) return false;

    await this.prisma.users.update({ where: { id: userId }, data: { email_verified_at: new Date() } });
    return true;
  }

  /** Silencieux si l'email n'existe pas ou est déjà vérifié — même protection contre l'énumération que le reset. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user || user.email_verified_at) return;

    await this.sendVerification(user.id, user.email);
  }
}
