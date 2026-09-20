import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    // getEnv() a déjà validé la présence de JWT_SECRET au démarrage (voir
    // main.ts) ; pas besoin de revérifier ici.
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getEnv().JWT_SECRET,
    });
  }

  /**
   * Le retour de `validate()` devient `req.user`.
   *
   * ── Pourquoi on interroge la base ici ────────────────────────────────────
   *
   * Un JWT est sans état : il reste valide jusqu'à son expiration, quoi qu'il
   * arrive ensuite au compte. Ce strategy se contentait du contenu du jeton,
   * si bien qu'après une suppression de compte l'ancien jeton continuait
   * d'ouvrir les portes pendant vingt-quatre heures.
   *
   * Trouvé en jouant le parcours d'un porteur jusqu'au bout, et les
   * conséquences étaient concrètes :
   *
   * - les tables qui portent une clé étrangère vers `users` — projets,
   *   souvenirs, profil marketplace — répondaient **500** sur une violation
   *   de contrainte, au lieu d'un refus propre ;
   * - celles qui n'en portent pas — `ledger_accounts`, `bank_accounts`, et
   *   c'est volontaire pour des raisons comptables — **acceptaient
   *   l'écriture** et créaient des lignes au nom d'une personne qui n'existe
   *   plus. Des données fantômes, écrites après que le droit à l'effacement a
   *   été exercé.
   *
   * Le coût est une requête par appel authentifié. Il est réel et assumé :
   * l'alternative est un produit qui écrit au nom de gens supprimés, ce
   * qu'aucune optimisation ne rachète. Si ce coût devient sensible, la
   * réponse sera un cache court ou des jetons plus brefs avec
   * rafraîchissement — pas de revenir à un garde qui croit le jeton sur
   * parole.
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!user) {
      // Le message reste vague exprès : dire « ce compte a été supprimé »
      // renseignerait sur l'existence d'un compte à qui présente un jeton
      // fabriqué. Côté interface, un 401 déclenche la déconnexion, ce qui est
      // exactement le comportement voulu.
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email };
  }
}
