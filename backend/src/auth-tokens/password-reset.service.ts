import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { getEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { MailService } from '../mail/mail.service.js';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Ne revele jamais si l'email existe ou non — meme comportement (renvoie,
   * sans erreur) que l'email existe ou pas, sinon n'importe qui pourrait
   * decouvrir quels emails sont inscrits en testant cet endpoint.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) return;

    const token = await this.authTokenService.issue(user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    const resetUrl = `${getEnv().FRONTEND_URL}/reset-password?token=${token}`;

    await this.mailService.send({
      to: user.email,
      subject: 'Réinitialise ton mot de passe Ignitux',
      text: `Clique sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) : ${resetUrl}\n\nSi tu n'es pas à l'origine de cette demande, ignore cet email.`,
    });
  }

  /** Renvoie true si le mot de passe a bien été changé, false si le token est invalide/expiré/déjà utilisé. */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const userId = await this.authTokenService.consume(token, 'password_reset');
    if (!userId) return false;

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.users.update({ where: { id: userId }, data: { password_hash: passwordHash } });
    return true;
  }
}
