/**
 * LES DROITS DE L'ÉQUIPE — qui voit et fait quoi sur un projet.
 *
 * Module pur. Le tableau ci-dessous est celui validé par Helder le 11/10/2026
 * (spec : docs/superpowers/specs/2026-10-11-equipe-roles-design.md, §3).
 *
 * Ce qui engage l'entreprise juridiquement ou financièrement reste au seul
 * propriétaire : actes juridiques, équipe, suppression. Le salarié travaille
 * sur les tâches et ne voit jamais l'argent ; le comptable voit l'argent et
 * jamais le reste du travail.
 */

/** Les rôles qu'on attribue à un membre. Le propriétaire n'est pas un rôle stocké. */
export const ROLES_EQUIPE = ['associe', 'salarie', 'comptable', 'observateur'] as const;
export type RoleEquipe = (typeof ROLES_EQUIPE)[number];
export type Role = 'proprietaire' | RoleEquipe;

export const ROLE_LABEL: Record<Role, string> = {
  proprietaire: 'Propriétaire',
  associe: 'Associé',
  salarie: 'Salarié',
  comptable: 'Comptable',
  observateur: 'Observateur',
};

export const CAPACITES = [
  'voir_projet',
  'voir_plan_financement',
  'modifier_projet',
  'voir_taches',
  'modifier_taches',
  'voir_conformite_memoire',
  'modifier_conformite_memoire',
  'lancer_ia',
  'demander_evaluation',
  'voir_evaluation',
  'voir_financement',
  'modifier_financement',
  'voir_documents_juridiques',
  'actes_juridiques',
  'gerer_equipe',
  'supprimer_projet',
] as const;
export type Capacite = (typeof CAPACITES)[number];

const PAR_ROLE: Record<RoleEquipe, readonly Capacite[]> = {
  associe: [
    'voir_projet',
    'voir_plan_financement',
    'modifier_projet',
    'voir_taches',
    'modifier_taches',
    'voir_conformite_memoire',
    'modifier_conformite_memoire',
    'lancer_ia',
    'voir_evaluation',
    'voir_financement',
    'voir_documents_juridiques',
  ],
  salarie: ['voir_projet', 'voir_taches', 'modifier_taches', 'voir_conformite_memoire'],
  comptable: ['voir_plan_financement', 'voir_evaluation', 'voir_financement', 'voir_documents_juridiques'],
  // L'accès des collaborateurs d'avant les rôles : tout voir, ne rien modifier.
  observateur: [
    'voir_projet',
    'voir_plan_financement',
    'voir_taches',
    'voir_conformite_memoire',
    'voir_evaluation',
    'voir_financement',
    'voir_documents_juridiques',
  ],
};

export function estRoleEquipe(valeur: string): valeur is RoleEquipe {
  return (ROLES_EQUIPE as readonly string[]).includes(valeur);
}

export function capacitesDe(role: Role): readonly Capacite[] {
  return role === 'proprietaire' ? CAPACITES : PAR_ROLE[role];
}

export function peutFaire(role: Role, capacite: Capacite): boolean {
  return capacitesDe(role).includes(capacite);
}
