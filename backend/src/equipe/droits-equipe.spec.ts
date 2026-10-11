import { CAPACITES, capacitesDe, estRoleEquipe, peutFaire, ROLES_EQUIPE, type Capacite, type Role } from './droits-equipe.js';

/** Le tableau du §3 de la spec, recopié tel quel : toute divergence fait échouer le test. */
const ATTENDU: Record<Capacite, Role[]> = {
  voir_projet: ['proprietaire', 'associe', 'salarie', 'observateur'],
  voir_plan_financement: ['proprietaire', 'associe', 'comptable', 'observateur'],
  modifier_projet: ['proprietaire', 'associe'],
  voir_taches: ['proprietaire', 'associe', 'salarie', 'observateur'],
  modifier_taches: ['proprietaire', 'associe', 'salarie'],
  voir_conformite_memoire: ['proprietaire', 'associe', 'salarie', 'observateur'],
  modifier_conformite_memoire: ['proprietaire', 'associe'],
  lancer_ia: ['proprietaire', 'associe'],
  demander_evaluation: ['proprietaire'],
  voir_evaluation: ['proprietaire', 'associe', 'comptable', 'observateur'],
  voir_financement: ['proprietaire', 'associe', 'comptable', 'observateur'],
  modifier_financement: ['proprietaire'],
  voir_documents_juridiques: ['proprietaire', 'associe', 'comptable', 'observateur'],
  actes_juridiques: ['proprietaire'],
  gerer_equipe: ['proprietaire'],
  supprimer_projet: ['proprietaire'],
};

describe('tableau des droits de l’équipe', () => {
  it('connaît exactement les rôles et les capacités de la spec', () => {
    expect([...ROLES_EQUIPE]).toEqual(['associe', 'salarie', 'comptable', 'observateur']);
    expect([...CAPACITES].sort()).toEqual(Object.keys(ATTENDU).sort());
  });

  it('applique le tableau du §3, rôle par rôle et capacité par capacité', () => {
    const roles: Role[] = ['proprietaire', ...ROLES_EQUIPE];
    for (const capacite of CAPACITES) {
      for (const role of roles) {
        expect(peutFaire(role, capacite), `${role} / ${capacite}`).toBe(ATTENDU[capacite].includes(role));
      }
    }
  });

  it('donne au propriétaire toutes les capacités', () => {
    expect([...capacitesDe('proprietaire')].sort()).toEqual([...CAPACITES].sort());
  });

  it('reconnaît un rôle d’équipe, jamais « proprietaire » qui ne se stocke pas', () => {
    expect(estRoleEquipe('associe')).toBe(true);
    expect(estRoleEquipe('proprietaire')).toBe(false);
    expect(estRoleEquipe('admin')).toBe(false);
  });
});
