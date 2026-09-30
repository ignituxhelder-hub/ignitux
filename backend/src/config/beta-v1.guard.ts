import { type CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { betaV1Actif } from './beta-v1.js';
import { getEnv } from './env.js';

/**
 * LE VRAI GARDE — pas le masquage du bureau, qui n'est que du confort.
 *
 * Posé sur les contrôleurs Portefeuille investisseur et Marketplace : tant
 * que la bêta V1 est active, ces routes refusent tout le monde, y compris
 * qui devinerait l'adresse directement. Rien n'est supprimé côté données.
 */
@Injectable()
export class BetaV1Guard implements CanActivate {
  canActivate(): boolean {
    if (betaV1Actif(getEnv().IGNITUX_BETA_V1)) {
      throw new ForbiddenException(
        "Cette fonctionnalité n'est pas ouverte pendant cette phase de test privé.",
      );
    }
    return true;
  }
}
