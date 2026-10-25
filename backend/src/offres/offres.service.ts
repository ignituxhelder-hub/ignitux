import { Injectable } from '@nestjs/common';
import { presenterBareme } from '../credits/bareme.js';
import { CATALOGUE, OFFRE_PAR_DEFAUT } from './offres-catalogue.js';

/**
 * LA PAGE DES OFFRES — ce qu'elle dit depuis les crédits IGINI (2026-10-25).
 *
 * Il n'y a plus d'abonnement à choisir : une seule offre, gratuite, qui
 * contient tous les outils ; les actions IGINI se paient en crédits. La
 * réponse garde la forme d'avant (`actuelle`, `souscriptionPossible`,
 * `offres`) pour que l'écran existant se lise sans casser, et ajoute
 * `credits`, qui renvoie vers `GET /credits` (solde, historique) et porte
 * le barème.
 *
 * Plus rien ici ne lit `subscriptions` ni ne décide d'un accès : l'ancien
 * `exiger` (et `droits.ts`) a disparu avec les offres payantes. La table
 * `subscriptions` reste en base, comme historique, et sort dans l'export
 * RGPD.
 */
@Injectable()
export class OffresService {
  catalogue() {
    return {
      actuelle: OFFRE_PAR_DEFAUT,
      // Rien à souscrire : l'offre est gratuite, et les recharges de crédits
      // passeront par `/credits` (paiement par carte, lot 2).
      souscriptionPossible: false,
      offres: CATALOGUE.map((o) => ({ ...o, actuelle: o.id === OFFRE_PAR_DEFAUT })),
      credits: {
        explication:
          'Tous les outils sont gratuits. Seules les actions d’IGINI se paient, en crédits : ' +
          '1 crédit = 0,10 €, prix fixe affiché avant de lancer, rien n’est débité si la ' +
          'génération échoue. 30 crédits sont offerts à l’inscription.',
        route: '/credits',
        bareme: presenterBareme(),
      },
    };
  }
}
