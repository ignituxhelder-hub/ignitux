import { Injectable, Logger } from '@nestjs/common';
import { getEnv } from '../config/env.js';

/**
 * VÉRIFICATION ANTI-ROBOT (CLOUDFLARE TURNSTILE).
 *
 * Seule protection contre la création de comptes en masse à l'inscription —
 * voir production-preflight.ts, qui exige TURNSTILE_SECRET_KEY en production.
 *
 * Fail-closed : toute clé absente ou appel réseau en échec rend `false`.
 * Une panne de Cloudflare qui ouvrirait l'inscription sans protection serait
 * pire qu'une inscription légitime refusée un instant.
 */
@Injectable()
export class TurnstileVerificationService {
  private readonly logger = new Logger(TurnstileVerificationService.name);

  async verify(token: string): Promise<boolean> {
    const secret = getEnv().TURNSTILE_SECRET_KEY;
    if (!secret) {
      this.logger.warn('TURNSTILE_SECRET_KEY absente : jeton refusé sans appel à Cloudflare.');
      return false;
    }

    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token }),
        signal: AbortSignal.timeout(5_000),
      });
      const data = (await response.json()) as { success?: boolean };
      return data.success === true;
    } catch (error) {
      this.logger.warn(
        `Vérification Turnstile indisponible — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
