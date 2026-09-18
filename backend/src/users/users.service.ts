import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
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
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    return { id: user.id, email: user.email };
  }
}