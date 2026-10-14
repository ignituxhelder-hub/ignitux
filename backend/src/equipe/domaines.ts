import type { RoleEquipe } from './droits-equipe.js';

/**
 * ÉQUIPE, LIVRAISON 2 — L'ESPACE ARGENT D'UN PROPRIÉTAIRE.
 *
 * Spec : docs/superpowers/specs/2026-10-14-equipe-argent-design.md
 *
 * Les modules d'argent (facturation, comptabilité, banque, caisse) sont
 * rangés par personne (`owner_id`), pas par projet. Un comptable ou un
 * associé d'AU MOINS UN projet d'un propriétaire y travaille « pour le
 * compte de » ce propriétaire, en lecture et en écriture.
 *
 * Un seul domaine se délègue : `argent`. Tout le reste de l'application
 * (CRM, agenda, stocks, véhicules, immobilier, publicité, et tout le
 * personnel : identité, compte, abonnement, profil, chat…) refuse l'espace
 * d'un autre (403, fermé par défaut — voir `EspaceInterceptor`). Le travail
 * sur un projet partagé passe, lui, par les rôles par projet de la
 * livraison 1 (`acces-projet.ts`), sans en-tête d'espace.
 *
 * Pur et sans dépendance d'exécution : la table de vérité de la spec, testée
 * telle quelle.
 */

export const DOMAINES = ['argent'] as const;
export type Domaine = (typeof DOMAINES)[number];

/** Les rôles de projet qui ouvrent l'espace argent du propriétaire. */
export const ROLES_ARGENT = ['comptable', 'associe'] as const satisfies readonly RoleEquipe[];
export type RoleArgent = (typeof ROLES_ARGENT)[number];

/**
 * Le dossier backend de chaque module délégable, et son domaine. Un module
 * absent d'ici ne se délègue pas : aucune de ses routes ne porte `@Espace`
 * (vérifié par `couverture-espaces.spec.ts`).
 */
export const DOMAINE_PAR_MODULE: Readonly<Record<string, Domaine>> = {
  billing: 'argent',
  ledger: 'argent',
  banking: 'argent',
  caisse: 'argent',
};

export function estRoleArgent(role: string): role is RoleArgent {
  return (ROLES_ARGENT as readonly string[]).includes(role);
}

/** Le rôle ouvre-t-il ce domaine ? Un rôle inconnu n'ouvre rien. */
export function roleCouvre(role: string, domaine: Domaine): boolean {
  return domaine === 'argent' && estRoleArgent(role);
}
