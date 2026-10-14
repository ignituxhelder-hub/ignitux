/**
 * L'ÉQUIPE CÔTÉ INTERFACE — miroir du tableau des droits du serveur
 * (backend/src/equipe/droits-equipe.ts).
 *
 * L'interface n'affiche que ce que le rôle permet ; c'est un confort, pas une
 * protection : le serveur revérifie chaque requête.
 */
export type RoleEquipe = 'associe' | 'salarie' | 'comptable' | 'observateur';
export type Role = 'proprietaire' | RoleEquipe;

export type Capacite =
  | 'voir_projet'
  | 'voir_plan_financement'
  | 'modifier_projet'
  | 'voir_taches'
  | 'modifier_taches'
  | 'voir_conformite_memoire'
  | 'modifier_conformite_memoire'
  | 'lancer_ia'
  | 'demander_evaluation'
  | 'voir_evaluation'
  | 'voir_financement'
  | 'modifier_financement'
  | 'voir_documents_juridiques'
  | 'actes_juridiques'
  | 'gerer_equipe'
  | 'supprimer_projet';

export interface MonAcces {
  role: Role;
  capacites: Capacite[];
}

export const ROLES_EQUIPE: RoleEquipe[] = ['associe', 'salarie', 'comptable', 'observateur'];

export const ROLE_EQUIPE_LABEL: Record<Role, string> = {
  proprietaire: 'Propriétaire',
  associe: 'Associé',
  salarie: 'Salarié',
  comptable: 'Comptable',
  observateur: 'Observateur',
};

/** Ce que chaque rôle permet, en une phrase, au moment de choisir. */
export const ROLE_EQUIPE_DESCRIPTION: Record<RoleEquipe, string> = {
  associe:
    'Voit et modifie le projet, lance IGINI, et travaille dans ta facturation, ta comptabilité, ta banque et ' +
    'ta caisse (accès automatique, que tu peux couper à tout moment). Le financement et les actes juridiques ' +
    'restent à toi.',
  salarie: 'Voit le projet et travaille sur les tâches. Ne voit pas l’argent.',
  comptable:
    'Travaille dans ta facturation, ta comptabilité, ta banque et ta caisse (accès automatique, que tu peux ' +
    'couper à tout moment) ; voit le financement, l’évaluation et les documents juridiques. Ne voit pas le ' +
    'reste du travail.',
  observateur: 'Voit tout, ne modifie rien.',
};

const LECTURE: Record<string, Capacite | null> = {
  analyse: 'voir_projet',
  construction: 'voir_projet',
  developpement: 'voir_projet',
  transmission: 'voir_projet',
  score: 'voir_projet',
  connaissances: 'voir_projet',
  automatisation: 'voir_projet',
  financement: 'voir_plan_financement',
  taches: 'voir_taches',
  processus: 'voir_taches',
  memoire: 'voir_conformite_memoire',
  conformite: 'voir_conformite_memoire',
  capital: 'voir_financement',
  'documents-juridiques': 'voir_documents_juridiques',
  infos: 'modifier_projet',
  collaborateurs: null,
};

/** Le droit qu'il faut pour voir une section ; `null` : tout membre la voit. */
export function lectureDeSection(section: string): Capacite | null {
  return section in LECTURE ? LECTURE[section] : 'voir_projet';
}
