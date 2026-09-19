/**
 * Ce que le module Facturation d'Ignitux est, et surtout ce qu'il n'est pas.
 *
 * Écrire un module de facturation sans dire ses limites serait la forme la
 * plus dangereuse de donnée inventée : l'utilisateur en déduirait qu'il est
 * en règle. Cet avertissement est renvoyé par l'API avec chaque liste de
 * documents, et affiché dans l'interface — pas enterré dans une page
 * d'aide que personne n'ouvre.
 *
 * Les règles techniques que le code applique réellement (numérotation
 * séquentielle, immuabilité après émission, correction par avoir) sont
 * dans billing-rules.ts et testées. Elles reprennent des principes du droit
 * français, mais les appliquer ne rend pas pour autant le logiciel
 * conforme : la conformité dépend de l'activité, du régime fiscal et
 * d'obligations qui évoluent.
 */
export const BILLING_DISCLAIMER =
  "Ignitux t'aide à tenir tes devis, factures et avoirs, et applique trois règles " +
  'structurantes du droit français : numérotation séquentielle sans trou, impossibilité ' +
  "de modifier ou supprimer un document émis, correction uniquement par avoir. " +
  "Ce n'est pas pour autant un logiciel de facturation certifié, et Ignitux ne vérifie " +
  "ni les mentions obligatoires propres à ton activité, ni ton régime de TVA, ni tes " +
  "obligations de facturation électronique. Vérifie ces points auprès d'une source " +
  'officielle ou de ton comptable avant d\'émettre des documents à des clients réels.';

/**
 * Les trois règles que le code applique vraiment, exposées telles quelles
 * pour que l'utilisateur sache ce sur quoi il peut compter — et, en creux,
 * ce sur quoi il ne peut pas.
 */
export const BILLING_ENFORCED_RULES: readonly string[] = [
  'La numérotation est séquentielle et sans trou, par type de document et par année.',
  "Un document émis ne peut plus être modifié ni supprimé.",
  "Une facture émise ne se corrige que par un avoir, qui la référence explicitement.",
];
