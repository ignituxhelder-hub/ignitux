/**
 * LES APPELS IA D'IGINI, NOMMÉS UNE SEULE FOIS.
 *
 * Fichier à part, et sans aucune dépendance : le journal de consommation et
 * le barème des crédits (`credits/bareme.ts`) ont tous deux besoin de ces
 * noms, et le barème doit rester pur — sans Nest, sans base.
 *
 * ## Pourquoi une seule liste
 *
 * Il y en a eu deux pendant un moment : `analyser/construire/financer/...`
 * côté journal, `analyse/construction/financement/...` côté offres. Rien
 * n'échouait — c'est le problème. Un prix posé sur un nom que personne
 * n'émet ne serait jamais débité, et rien ne le signalerait. Le barème est
 * indexé par ce type : un nom ajouté ici sans prix ne compile pas.
 *
 * Ces chaînes sont écrites en base (`ai_usage_events.generator`,
 * `credit_entries.generator`). Les renommer demande une migration des lignes
 * existantes, pas seulement un remplacement dans les sources.
 */

/** Les six générateurs de méthode : les étapes du parcours IGINI. */
export const GENERATEURS_METHODE = [
  'analyser',
  'former',
  'construire',
  'financer',
  'developper',
  'transmettre',
] as const;

/**
 * Tous les noms que le journal accepte, chacun avec un prix en crédits
 * (`credits/bareme.ts`) :
 *
 * - les six de méthode ;
 * - « executer » : une tâche du projet faite par IGINI ;
 * - « discuter » : un message envoyé au chat (les tours de l'orchestrateur).
 *   Un générateur déclenché depuis le chat se journalise — et se paie — sous
 *   son propre nom, en plus du message ;
 * - « evaluer » : l'évaluation de financement ;
 * - « questionner » : les questions d'IGINI à la fin du questionnaire ;
 * - « statuts » : le brouillon des statuts (journalisé sous « former »
 *   jusqu'au 2026-10-25) ;
 * - « conformite » : une démarche de conformité préparée par IGINI, qui lit
 *   la fiche officielle (journalisée sous « executer » jusqu'au 2026-10-25).
 *
 * Ces deux derniers ont leur nom depuis que chaque appel a un prix affiché :
 * un document de statuts ou une fiche lue coûtent deux fois une
 * recommandation ou une tâche, et un prix moyen commun aurait faussé les
 * deux.
 */
export const GENERATOR_NAMES = [
  ...GENERATEURS_METHODE,
  'executer',
  'discuter',
  'evaluer',
  'questionner',
  'statuts',
  'conformite',
] as const;

export type GeneratorName = (typeof GENERATOR_NAMES)[number];

export function estGenerateur(valeur: string): valeur is GeneratorName {
  return (GENERATOR_NAMES as readonly string[]).includes(valeur);
}
