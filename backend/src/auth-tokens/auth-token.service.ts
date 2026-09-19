import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthTokenPurpose } from './auth-token-purpose.js';

/**
 * Emission et verification de tokens a usage unique (reinitialisation de mot
 * de passe, verification d'email) — meme mecanisme partage pour les deux,
 * seul le `purpose` differe. Le token en clair n'est jamais stocke : seul son
 * hash SHA-256 l'est, comme pour un mot de passe — un vol de la base ne
 * suffit pas a rejouer un lien envoye par email.
 */
@Injectable()
export class AuthTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Cree un nouveau token pour cet utilisateur et renvoie sa version en clair (a mettre dans l'email). */
  async issue(userId: string, purpose: AuthTokenPurpose, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.prisma.auth_tokens.create({
      data: {
        user_id: userId,
        token_hash: this.hash(token),
        purpose,
        expires_at: new Date(Date.now() + ttlMs),
      },
    });

    return token;
  }

  /**
   * Consomme un token : le marque comme utilise et renvoie l'id de
   * l'utilisateur si le token est valide (existe, bon purpose, pas expire,
   * pas deja utilise) — sinon `null`. Un token consomme ne peut pas resservir.
   */
  async consume(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
    const record = await this.prisma.auth_tokens.findUnique({
      where: { token_hash: this.hash(token) },
    });

    if (!record || record.purpose !== purpose || record.used_at || record.expires_at < new Date()) {
      return null;
    }

    await this.prisma.auth_tokens.update({
      where: { id: record.id },
      data: { used_at: new Date() },
    });

    return record.user_id;
  }
}
