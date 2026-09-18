import { Injectable, ConflictException } from '@nestjs/common';
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
}