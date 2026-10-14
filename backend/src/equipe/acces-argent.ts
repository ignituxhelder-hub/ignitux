import { estRoleArgent } from './domaines.js';

/**
 * ACCÈS À L'ARGENT : AUTOMATIQUE OU ACTIVÉ — décision de Helder du
 * 2026-10-14 (« un peu des deux »). Spec :
 * docs/superpowers/specs/2026-10-14-equipe-argent-design.md
 *
 * Un collaborateur C, comptable ou associé sur au moins un projet d'un
 * propriétaire X, a accès à l'argent de X (facturation, comptabilité,
 * banque, caisse) si et seulement si :
 *
 * (a) X le lui a ACTIVÉ — ligne `space_members` (X, C) avec le rôle
 *     `'argent'` ; ou
 * (b) X ne le lui a PAS COUPÉ (pas de ligne `'refuse'`) ET C a été ajouté
 *     comme comptable ou associé sur un projet de X à partir de
 *     `ACCES_ARGENT_AUTOMATIQUE_DEPUIS`.
 *
 * Et dans tous les cas C doit ÊTRE ENCORE comptable ou associé sur au moins
 * un projet de X : une ligne `space_members` n'ouvre rien à elle seule.
 *
 * Pur et sans dépendance d'exécution : la table de vérité de la spec,
 * testée telle quelle (`acces-argent.spec.ts`). La lecture en base est dans
 * `EspaceService`, relue à chaque requête, sans cache.
 */

/**
 * Les invitations faites AVANT cette date l'ont été sous les anciens textes,
 * qui ne parlaient pas d'accès à l'argent du propriétaire : elles demandent
 * une activation explicite du propriétaire. Celles faites à partir de cette
 * date donnent l'accès automatiquement (le propriétaire peut le couper).
 *
 * Seule compte `project_collaborators.created_at` — la date de la ligne
 * (projet, collaborateur). Un changement de rôle n'a pas de date : un
 * ancien collaborateur promu comptable ou associé plus tard garde la date
 * de sa ligne, donc il faut l'activer — c'est le côté prudent. Une ligne
 * sans date compte comme ancienne.
 */
export const ACCES_ARGENT_AUTOMATIQUE_DEPUIS = new Date('2026-10-15T00:00:00+02:00');

/**
 * Les deux valeurs de `space_members.role` écrites par ce lot. Toute autre
 * valeur (reste éventuel de la version abandonnée le 14/10/2026) vaut
 * « aucun choix ».
 */
export const CHOIX_ACCES_ARGENT = { active: 'argent', coupe: 'refuse' } as const;

/**
 * Pourquoi l'accès est ouvert ou fermé, du point de vue du propriétaire :
 * - `active_par_toi` : il l'a activé (a) ;
 * - `automatique` : invité à partir de la date limite, non coupé (b) ;
 * - `coupe_par_toi` : il l'a coupé ;
 * - `a_activer` : invité avant la date limite, jamais activé.
 */
export type RaisonAccesArgent = 'active_par_toi' | 'automatique' | 'coupe_par_toi' | 'a_activer';

export interface AccesArgentEffectif {
  acces: boolean;
  raison: RaisonAccesArgent;
}

/** Une ligne `project_collaborators` de C sur un projet de X. */
export interface LienCollaborateur {
  role: string;
  created_at: Date | null;
}

/**
 * L'accès de C à l'argent de X, à partir de SES lignes de collaborateur sur
 * les projets de X et du choix de X (`space_members.role`, ou rien).
 * `null` : C n'est (plus) comptable ni associé sur aucun projet de X — pas
 * d'accès, quel que soit le choix enregistré.
 */
export function accesArgent(
  liens: readonly LienCollaborateur[],
  choix: string | null | undefined,
): AccesArgentEffectif | null {
  const actuels = liens.filter((lien) => estRoleArgent(lien.role));
  if (actuels.length === 0) return null;
  if (choix === CHOIX_ACCES_ARGENT.active) return { acces: true, raison: 'active_par_toi' };
  if (choix === CHOIX_ACCES_ARGENT.coupe) return { acces: false, raison: 'coupe_par_toi' };
  const limite = ACCES_ARGENT_AUTOMATIQUE_DEPUIS.getTime();
  const invitationRecente = actuels.some(
    (lien) => lien.created_at !== null && lien.created_at.getTime() >= limite,
  );
  return invitationRecente ? { acces: true, raison: 'automatique' } : { acces: false, raison: 'a_activer' };
}
