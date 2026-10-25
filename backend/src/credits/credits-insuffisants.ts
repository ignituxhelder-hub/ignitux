import { HttpException, HttpStatus } from '@nestjs/common';

/** Le code machine du refus, pour que l'interface propose « Recharger » sans lire la phrase. */
export const CODE_CREDITS_INSUFFISANTS = 'credits_insuffisants';

export interface CorpsCreditsInsuffisants {
  statusCode: 402;
  code: typeof CODE_CREDITS_INSUFFISANTS;
  message: string;
  /** Le prix de l'action, en crédits. */
  requis: number;
  /** Le solde au moment du refus. */
  disponible: number;
}

function credits(n: number): string {
  return `${n} crédit${Math.abs(n) > 1 ? 's' : ''}`;
}

/**
 * Le solde ne couvre pas le prix de l'action : **402 Payment Required**, et
 * cette fois au sens propre — recharger débloque.
 *
 * Levé AVANT tout appel à l'IA : rien n'a été dépensé, rien n'a été débité.
 * Le corps porte `requis` et `disponible` pour que l'interface affiche les
 * deux chiffres sans analyser la phrase.
 */
export class CreditsInsuffisantsException extends HttpException {
  constructor(requis: number, disponible: number) {
    const corps: CorpsCreditsInsuffisants = {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      code: CODE_CREDITS_INSUFFISANTS,
      message: `Crédits insuffisants : il te faut ${credits(requis)}, tu en as ${Math.max(0, disponible)}.`,
      requis,
      disponible,
    };
    super(corps, HttpStatus.PAYMENT_REQUIRED);
  }
}
