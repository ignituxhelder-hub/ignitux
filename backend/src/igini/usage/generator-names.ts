/**
 * LES GÉNÉRATEURS D'IGINI, ET LE CHAT, NOMMÉS UNE SEULE FOIS.
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
 *
 * `discuter` (les tours de conversation de l'orchestrateur IGINI) est ici
 * pour la même raison de traçabilité des coûts que les 5 générateurs, mais
 * suit une règle différente : aucun appel ne passe par
 * `OffresService.exiger()` pour lui (voir `ClaudeService.converseWithTools`)
 * — seul le plafond de coût global le protège. Un tour de conversation qui
 * déclenche un générateur (ex. `analyser`) journalise CE générateur sous
 * son propre nom existant, via le code déjà en place ; `discuter` ne
 * journalise jamais que les tours de l'orchestrateur lui-même.
 */
export const GENERATOR_NAMES = [
  'analyser',
  'construire',
  'financer',
  'developper',
  'transmettre',
  'discuter',
] as const;

export type GeneratorName = (typeof GENERATOR_NAMES)[number];

export function estGenerateur(valeur: string): valeur is GeneratorName {
  return (GENERATOR_NAMES as readonly string[]).includes(valeur);
}
