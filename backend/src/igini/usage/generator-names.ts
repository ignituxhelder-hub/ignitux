/**
 * LES SIX GÉNÉRATEURS, NOMMÉS UNE SEULE FOIS.
 *
 * Fichier à part, et sans aucune dépendance : le journal de consommation,
 * le catalogue des offres et les contrôles de droits ont tous besoin de ces
 * noms, et deux d'entre eux doivent rester purs — sans Nest, sans base.
 *
 * ## Pourquoi pas deux listes
 *
 * Il y en a eu deux pendant un moment : `analyser/construire/financer/...`
 * côté journal, `analyse/construction/financement/...` côté offres. Rien
 * n'échouait — c'est le problème. Un quota se serait appliqué à un nom que
 * personne n'émettait, et le refus ne serait jamais venu. Le commentaire
 * qui interdisait déjà d'écrire « Analyser » avec une majuscule disait la
 * même chose, en plus petit.
 *
 * Ces chaînes sont écrites en base (`ai_usage_events.generator`). Les
 * renommer demande une migration des lignes existantes, pas seulement un
 * remplacement dans les sources.
 */
/** Les six générateurs de méthode : ceux que les offres annoncent. */
export const GENERATEURS_METHODE = [
  'analyser',
  'former',
  'construire',
  'financer',
  'developper',
  'transmettre',
] as const;

/**
 * Tous les noms que le journal accepte : les six de méthode, plus
 * « executer » — l'exécution d'une tâche par IGINI. Ce septième nom n'est
 * dans la liste d'aucune offre (voir `droits.ts`), mais il consomme les
 * générations du mois comme les autres.
 */
export const GENERATOR_NAMES = [...GENERATEURS_METHODE, 'executer'] as const;

export type GeneratorName = (typeof GENERATOR_NAMES)[number];

export function estGenerateur(valeur: string): valeur is GeneratorName {
  return (GENERATOR_NAMES as readonly string[]).includes(valeur);
}
