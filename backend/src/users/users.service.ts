import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  // Hash bidon (aucun mot de passe réel n'y correspond), comparé quand l'email
  // n'existe pas, pour que la réponse prenne le même temps que pour un email
  // existant et n'expose pas par le timing quels comptes existent.
  private static readonly DUMMY_PASSWORD_HASH =
    '$2b$10$Ng8naqddSIUPPL1wu4ZGfOP8YSP.7iWHjjKrcbrujFXfuXTS8xBaq';

  constructor(private readonly prisma: PrismaService) {}

  async signup(email: string, password: string) {
    const existingUser = await this.prisma.users.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.users.create({
      data: {
        email,
        password_hash: passwordHash,
      },
    });

    return { id: user.id, email: user.email };
  }

  /** Vérifie l'email/mot de passe et renvoie l'utilisateur (sans le hash) s'ils sont valides, sinon null. */
  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.users.findUnique({ where: { email } });

    // On compare toujours un hash bcrypt, même si l'email n'existe pas,
    // pour ne pas révéler par le temps de réponse quels comptes existent.
    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password_hash ?? UsersService.DUMMY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      return null;
    }

    return { id: user.id, email: user.email };
  }

  /**
   * Changement de mot de passe pour un utilisateur déjà connecté (par
   * opposition à la réinitialisation par email, pour qui a oublié le sien) —
   * exige le mot de passe actuel plutôt qu'un token, pour éviter qu'une
   * session volée (JWT) suffise seule à verrouiller le compte hors de portée
   * de son propriétaire.
   *
   * Lève un 403 (ForbiddenException), pas un 401 : le JWT est valide,
   * l'utilisateur EST authentifié, il a juste fourni un mauvais mot de passe
   * actuel. Un 401 ici serait intercepté par le frontend comme "session
   * expirée" et déconnecterait l'utilisateur à tort — un mauvais mot de passe
   * actuel ne doit jamais invalider une session par ailleurs valide.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.users.findUniqueOrThrow({ where: { id: userId } });

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      throw new ForbiddenException('Mot de passe actuel incorrect.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.users.update({ where: { id: userId }, data: { password_hash: passwordHash } });
  }
}