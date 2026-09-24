import { SetMetadata } from '@nestjs/common';
import type { RessourceDatee } from './ressources-datees.js';

export const ECRITURE_DATEE = 'ignitux:ecriture-datee';

/**
 * L'en-tête que la file d'attente hors ligne pose sur une écriture rejouée.
 *
 * Sa valeur est un **âge en millisecondes**, pas une date — et c'est tout le
 * dispositif. Une date viendrait de l'horloge du téléphone, qu'on ne contrôle
 * pas : une montre en retard de dix minutes ferait refuser tout le travail
 * fait hors ligne, ce qui est exactement la panne qu'on veut éviter.
 *
 * Un âge est une soustraction entre deux lectures de la MÊME horloge — celle
 * de l'appareil, au moment de la mise en file puis au moment de l'envoi. Le
 * décalage de cette horloge s'annule dans la soustraction. Le serveur
 * reconstitue l'instant de capture sur sa propre horloge : `maintenant - âge`.
 */
export const EN_TETE_CAPTURE = 'x-ignitux-capture-age';

export interface CibleDatee {
  ressource: RessourceDatee;
  /** Le paramètre d'URL qui porte l'identifiant de la ligne. */
  parametre: string;
}

/**
 * Refuse une écriture capturée hors ligne AVANT la dernière modification
 * connue de la ressource.
 *
 * ── Ce que ça protège ────────────────────────────────────────────────────
 *
 * Quelqu'un modifie une tâche sur son téléphone, sans réseau. L'écriture part
 * en file d'attente. Entre-temps, depuis son ordinateur, il modifie la même
 * tâche. Quand le téléphone retrouve le réseau, la file rejoue — et écrase la
 * version plus récente, sans que rien ne le signale. C'était le dernier trou
 * connu du dispositif hors ligne, et le seul capable de faire disparaître du
 * travail en silence.
 *
 * ── Ce que ça ne fait pas ────────────────────────────────────────────────
 *
 * Rien, en ligne. Sans l'en-tête, le garde laisse passer : une écriture
 * envoyée directement n'a pas d'âge à comparer, et se mesurer à elle-même
 * n'aurait aucun sens. Le comportement de tous les appels normaux est donc
 * inchangé — ce garde ne s'adresse qu'aux écritures revenues du froid.
 *
 * Il ne résout pas non plus le conflit : il le signale. L'écriture part dans
 * les « refusées » du bandeau, avec la raison, et la personne décide. Fusionner
 * automatiquement deux versions supposerait savoir laquelle a raison, ce que
 * personne ici ne sait.
 */
export const RefuserEcritureDepassee = (ressource: RessourceDatee, parametre = 'id') =>
  SetMetadata(ECRITURE_DATEE, { ressource, parametre } satisfies CibleDatee);
