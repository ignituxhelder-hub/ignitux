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
    const lien = await this.createResetLink(email);
    if (!lien) return;

    await this.mailService.send({
      to: lien.email,
      subject: 'Réinitialise ton mot de passe Ignitux',
      text: `Clique sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) : ${lien.url}\n\nSi tu n'es pas à l'origine de cette demande, ignore cet email.`,
    });
  }

  /**
   * Émet un jeton et construit le lien, sans l'envoyer.
   *
   * Séparé de `requestReset` pour une raison précise : tant que
   * `MAIL_TRANSPORT` vaut `log`, aucun email ne part, et la première
   * personne qui oublie son mot de passe est enfermée dehors. Un exploitant
   * doit pouvoir lui fabriquer un lien et le lui transmettre autrement —
   * c'est ce que fait `scripts/lien-mot-de-passe.mjs`.
   *
   * Le lien se construit **ici** et nulle part ailleurs : la durée de vie et
   * la forme de l'adresse sont les mêmes pour l'email et pour la console.
   * Recopier l'une des deux dans un script, c'est se préparer à envoyer un
   * jour un lien qui ne mène nulle part parce que la route a changé.
   *
   * `null` quand l'email est inconnu — l'appelant décide quoi en dire. La
   * route publique se tait, pour ne pas devenir un annuaire ; la console,
   * elle, a tout intérêt à le dire.
   */
  async createResetLink(email: string): Promise<{ email: string; url: string } | null> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) return null;

    const token = await this.authTokenService.issue(user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    return {
      email: user.email,
      url: `${getEnv().FRONTEND_URL}/reset-password?token=${token}`,
    };
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
