import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getEnv } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // getEnv() a déjà validé la présence de JWT_SECRET au démarrage (voir
    // main.ts) ; pas besoin de revérifier ici.
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getEnv().JWT_SECRET,
    });
  }

  // Le retour de validate() devient `req.user`.
  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
