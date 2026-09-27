import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from '../auth-tokens/auth-token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';

// 30 jours : assez long pour qu'une application mobile ne redemande jamais
// le mot de passe en usage normal, assez court pour qu'un jeton volé et
// inutilisé finisse par expirer. Le jeton d'accès, lui, garde sa durée
// habituelle (JWT_EXPIRES_IN) — c'est le renouvellement qui change, pas la
// durée de la session courte.
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly authTokenService: AuthTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect.');
    }

    return this.issueTokens(user);
  }

  /**
   * Échange un jeton de rafraîchissement valide contre une nouvelle paire
   * (accès + rafraîchissement). Le jeton présenté est consommé qu'il soit
   * réutilisé ensuite ou non — le renouvellement fait toujours tourner le
   * jeton (`AuthTokenService.consume` le marque utilisé), ce qui rend un
   * vol détectable : si l'ancien jeton ressert après ce point, c'est qu'il a
   * été copié, et il échoue puisqu'il est déjà consommé.
   */
  async refresh(refreshToken: string) {
    const userId = await this.authTokenService.consume(refreshToken, 'refresh');
    if (!userId) {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide ou expiré.');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      // Même raisonnement que JwtStrategy.validate : le compte a disparu
      // entre l'émission du jeton et son usage, on ne relance rien à sa place.
      throw new UnauthorizedException();
    }

    return this.issueTokens(user);
  }

  /** Invalide un jeton de rafraîchissement — la déconnexion, côté serveur. */
  async logout(refreshToken: string): Promise<void> {
    await this.authTokenService.consume(refreshToken, 'refresh');
  }

  private async issueTokens(user: { id: string; email: string }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ sub: user.id, email: user.email }),
      this.authTokenService.issue(user.id, 'refresh', REFRESH_TOKEN_TTL_MS),
    ]);

    return { accessToken, refreshToken, user };
  }
}
