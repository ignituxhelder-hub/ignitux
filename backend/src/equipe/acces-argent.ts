import { estRoleArgent } from './domaines.js';

/**
 * ACCÈS À L'ARGENT : CONSENTI AU GESTE DU PROPRIÉTAIRE — décision de Helder
 * du 2026-10-14 (« un peu des deux »), revue le même jour. Spec :
 * docs/superpowers/specs/2026-10-14-equipe-argent-design.md
 *
 * Un collaborateur C, comptable ou associé sur au moins un projet d'un
 * propriétaire X, a accès à l'argent de X (facturation, comptabilité,
 * banque, caisse) si et seulement si la ligne `space_members` (X, C) vaut :
 *
 * - `'argent'` : X le lui a ACTIVÉ (`PUT /espaces/acces-argent/:memberId`) ;
 * - `'argent_auto'` : accordé par le code au moment où X l'a INVITÉ comme
 *   comptable ou associé, ou lui a DONNÉ l'un de ces rôles
 *   (`EquipeService`) — le consentement est pris au geste, sous les textes
 *   qui disent que l'accès est automatique et se coupe.
 *
 * `'refuse'` (coupé par X) : pas d'accès. Aucune ligne : pas d'accès, « à
 * activer » — le cas des collaborateurs invités avant ce lot, sous les
 * anciens textes qui ne parlaient pas de l'argent du propriétaire.
 *
 * Aucune date n'entre en jeu : une date limite fixe aurait ouvert l'accès à
 * des personnes invitées sous les anciens textes si la mise en ligne avait
 * eu lieu après elle.
 *
 * Et dans tous les cas C doit ÊTRE ENCORE comptable ou associé sur au moins
 * un projet de X : une ligne `space_members` n'ouvre rien à elle seule (et
 * retirer un collaborateur ne la supprime pas).
 *
 * Pur et sans dépendance d'exécution : la table de vérité de la spec,
 * testée telle quelle (`acces-argent.spec.ts`). La lecture en base est dans
 * `EspaceService`, relue à chaque requête, sans cache.
 */

/**
 * Les trois valeurs de `space_members.role` écrites par ce lot. Toute autre
 * valeur (reste éventuel de la version abandonnée le 14/10/2026) vaut
 * « aucune ligne ».
 */
export const CHOIX_ACCES_ARGENT = { active: 'argent', automatique: 'argent_auto', coupe: 'refuse' } as const;

/**
 * Pourquoi l'accès est ouvert ou fermé, du point de vue du propriétaire :
 * - `active_par_toi` : il l'a activé (`'argent'`) ;
 * - `automatique` : accordé à l'invitation ou au passage comptable / associé
 *   (`'argent_auto'`) ;
 * - `coupe_par_toi` : il l'a coupé (`'refuse'`) ;
 * - `a_activer` : aucune ligne — jamais activé.
 */
export type RaisonAccesArgent = 'active_par_toi' | 'automatique' | 'coupe_par_toi' | 'a_activer';

export interface AccesArgentEffectif {
  acces: boolean;
  raison: RaisonAccesArgent;
}

/** Une ligne `project_collaborators` de C sur un projet de X : seul son rôle ACTUEL compte. */
export interface LienCollaborateur {
  role: string;
}

/**
 * L'accès de C à l'argent de X, à partir de SES lignes de collaborateur sur
 * les projets de X et de la ligne `space_members` (X, C) (`role`, ou rien).
 * `null` : C n'est (plus) comptable ni associé sur aucun projet de X — pas
 * d'accès, quelle que soit la ligne enregistrée.
 */
export function accesArgent(
  liens: readonly LienCollaborateur[],
  choix: string | null | undefined,
): AccesArgentEffectif | null {
  if (!liens.some((lien) => estRoleArgent(lien.role))) return null;
  switch (choix) {
    case CHOIX_ACCES_ARGENT.active:
      return { acces: true, raison: 'active_par_toi' };
    case CHOIX_ACCES_ARGENT.automatique:
      return { acces: true, raison: 'automatique' };
    case CHOIX_ACCES_ARGENT.coupe:
      return { acces: false, raison: 'coupe_par_toi' };
    default:
      return { acces: false, raison: 'a_activer' };
  }
}
