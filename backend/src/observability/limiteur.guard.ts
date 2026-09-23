import { HttpException, HttpStatus, Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * LE LIMITEUR QUI S'EXPLIQUE.
 *
 * Tous les refus d'Ignitux disent pourquoi et proposent une suite : un 403
 * nomme l'offre qui rouvre la porte et précise que le compteur repart le
 * mois prochain, un 402 dit ce qui a été consommé, un 422 cite l'article de
 * la Constitution. Un seul faisait exception, et c'était le plus fréquent.
 *
 * Le limiteur de débit rendait le corps brut de `@nestjs/throttler` :
 *
 *     "ThrottlerException: Too Many Requests"
 *
 * Une chaîne, pas un objet — donc l'interface n'y trouvait aucun `message`
 * et retombait sur son texte de dernier recours : **« Une erreur est
 * survenue. »**
 *
 * Trois choses fausses dans cette phrase, et la personne les subit toutes :
 *
 * 1. Rien n'est survenu. Le produit a **décidé** de refuser, et c'est un bon
 *    refus — il protège les comptes contre l'essai de mots de passe en
 *    rafale. Le présenter comme une panne fait passer une protection pour
 *    une défaillance.
 * 2. Elle ne dit pas quoi faire. Or la réponse contient déjà `Retry-After:
 *    60`, la seule information utile : il faut attendre, et on sait combien.
 * 3. Elle invite à réessayer tout de suite, ce qui ne débloque rien. La
 *    personne clique, reçoit la même phrase, et conclut que le site est
 *    cassé — au moment précis où elle essaie d'entrer chez elle.
 *
 * Ce garde ne change ni le seuil ni le comptage : il ne touche qu'à la
 * phrase, et ajoute le nombre de secondes que le serveur connaissait déjà.
 */
@Injectable()
export class LimiteurQuiSExplique extends ThrottlerGuard {
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // `timeToBlockExpire` quand un blocage est en cours, `timeToExpire`
    // sinon. Les deux sont en secondes et peuvent valoir 0 juste avant la
    // bascule : on ne promet jamais « 0 seconde », qui se lirait comme
    // « réessaie maintenant » et renverrait droit dans le mur.
    const secondes = Math.max(
      1,
      Math.ceil(detail.timeToBlockExpire || detail.timeToExpire || detail.ttl / 1000),
    );

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message:
          `Trop de tentatives en peu de temps. Attends ${secondes} seconde` +
          `${secondes > 1 ? 's' : ''} avant de réessayer — ce n'est pas une panne : ` +
          'cette limite existe pour empêcher quelqu’un de deviner un mot de passe ' +
          'en essayant en rafale.',
        secondesAAttendre: secondes,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
