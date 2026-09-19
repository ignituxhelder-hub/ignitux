/**
 * DISPONIBILITÉ DES 5 GÉNÉRATEURS IGINI.
 *
 * Les générateurs (Analyser, Construire, Financer, Développer, Transmettre)
 * sont les seules fonctionnalités d'Ignitux qui consomment du budget IA.
 * Ce module porte l'interrupteur qui les coupe, et rien d'autre.
 *
 * Pourquoi un interrupteur explicite plutôt que « on retire la clé API » :
 * sans clé, l'appel part quand même, échoue côté SDK, et la personne voit
 * une erreur. Une erreur dit « c'est cassé ». Or ce n'est pas cassé, c'est
 * volontairement éteint — et ces deux messages ne doivent pas se ressembler.
 *
 * L'interrupteur est côté serveur, en amont de tout appel réseau : une
 * interface qui se contenterait de griser un bouton laisserait l'API
 * atteignable pour qui la connaît. Ici, la dépense est impossible, pas
 * seulement découragée.
 */

export const GENERATORS_DISABLED_MESSAGE =
  "Fonctionnalité IA non disponible pour ce test. Les 5 générateurs d'IGINI (Analyser, " +
  'Construire, Financer, Développer, Transmettre) sont volontairement éteints sur cet ' +
  "environnement : aucune demande n'est envoyée à l'IA. Tout le reste d'Ignitux fonctionne " +
  'normalement.';

export interface GeneratorsAvailability {
  enabled: boolean;
  /** Ce qu'il faut afficher à la personne quand c'est éteint. `null` sinon. */
  reason: string | null;
}

/**
 * Lit l'interrupteur. Tout ce qui n'est pas exactement `'false'` laisse les
 * générateurs actifs : l'état par défaut d'Ignitux est un produit complet,
 * et couper une fonctionnalité doit être une décision écrite, pas le
 * résultat d'une variable oubliée ou mal orthographiée.
 */
export function readGeneratorsAvailability(flag: string | undefined): GeneratorsAvailability {
  if (flag === 'false') {
    return { enabled: false, reason: GENERATORS_DISABLED_MESSAGE };
  }
  return { enabled: true, reason: null };
}
