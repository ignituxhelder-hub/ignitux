import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * LE CONTEXTE D'ESPACE D'UNE REQUÊTE — « suis-je chez quelqu'un d'autre ? ».
 *
 * Repris de la branche `feat/equipe` (revue de sécurité passée), réduit à ce
 * dont l'espace argent a besoin : savoir, pendant la requête, qui agit et
 * chez qui.
 *
 * - l'intercepteur global `EspaceInterceptor` ouvre un contexte vide pour
 *   chaque requête HTTP (Nest lie l'exécution du contrôleur à ce contexte) ;
 * - `ResoudreEspacePipe` y note l'acteur et le propriétaire résolus.
 *
 * Fermé par défaut : si un espace étranger est résolu alors qu'aucun
 * contexte n'est ouvert (intercepteur absent, câblage cassé), le pipe refuse
 * la requête — sans intercepteur, il n'y aurait ni refus des routes non
 * marquées ni journal d'activité.
 */

interface ContexteEspace {
  acteurId?: string;
  ownerId?: string;
}

const stockage = new AsyncLocalStorage<ContexteEspace>();

/** Exécute `fn` dans un contexte d'espace neuf (un par requête). */
export function dansUnContexteEspace<T>(fn: () => T): T {
  return stockage.run({}, fn);
}

/**
 * Note la résolution de l'espace pour la requête en cours. Rend `false`
 * quand aucun contexte n'est ouvert : l'appelant décide alors (le pipe
 * refuse un espace étranger).
 */
export function noterEspaceResolu(acteurId: string, ownerId: string): boolean {
  const contexte = stockage.getStore();
  if (!contexte) return false;
  contexte.acteurId = acteurId;
  contexte.ownerId = ownerId;
  return true;
}

/** La requête en cours agit-elle dans l'espace d'un AUTRE ? */
export function dansUnEspaceEtranger(): boolean {
  const contexte = stockage.getStore();
  return Boolean(contexte?.ownerId && contexte.acteurId && contexte.ownerId !== contexte.acteurId);
}
