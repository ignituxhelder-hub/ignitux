import { DOMAINE_PAR_MODULE, DOMAINES, estRoleArgent, roleCouvre, ROLES_ARGENT } from './domaines.js';
import { ROLES_EQUIPE } from './droits-equipe.js';

describe('domaines de l’espace argent (spec 2026-10-14)', () => {
  it('un seul domaine se délègue : l’argent', () => {
    expect([...DOMAINES]).toEqual(['argent']);
  });

  it('seuls comptable et associé ouvrent l’argent du propriétaire', () => {
    expect([...ROLES_ARGENT].sort()).toEqual(['associe', 'comptable']);
    for (const role of ROLES_EQUIPE) {
      expect(roleCouvre(role, 'argent')).toBe(role === 'comptable' || role === 'associe');
    }
    expect(roleCouvre('proprietaire', 'argent')).toBe(false);
    expect(roleCouvre('', 'argent')).toBe(false);
    expect(estRoleArgent('salarie')).toBe(false);
  });

  it('les modules argent sont exactement facturation, comptabilité, banque et caisse', () => {
    expect(Object.keys(DOMAINE_PAR_MODULE).sort()).toEqual(['banking', 'billing', 'caisse', 'ledger']);
    expect(new Set(Object.values(DOMAINE_PAR_MODULE))).toEqual(new Set(['argent']));
  });
});
