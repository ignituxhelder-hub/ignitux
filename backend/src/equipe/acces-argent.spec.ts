import * as regle from './acces-argent.js';
import { accesArgent, CHOIX_ACCES_ARGENT } from './acces-argent.js';

describe('accesArgent — accès consenti au geste du propriétaire (décision du 2026-10-14, après revue)', () => {
  it('trois choix écrits : activé, accordé à l’invitation, coupé', () => {
    expect(CHOIX_ACCES_ARGENT).toEqual({ active: 'argent', automatique: 'argent_auto', coupe: 'refuse' });
  });

  it('plus aucune date limite : le module n’exporte que la règle et ses choix', () => {
    expect(Object.keys(regle).sort()).toEqual(['CHOIX_ACCES_ARGENT', 'accesArgent']);
  });

  it.each(['comptable', 'associe'])('%s, ligne « argent » (activé par le propriétaire) : accès', (role) => {
    expect(accesArgent([{ role }], 'argent')).toEqual({ acces: true, raison: 'active_par_toi' });
  });

  it.each(['comptable', 'associe'])('%s, ligne « argent_auto » (accordé à l’invitation) : accès', (role) => {
    expect(accesArgent([{ role }], 'argent_auto')).toEqual({ acces: true, raison: 'automatique' });
  });

  it('ligne « refuse » (coupé par le propriétaire) : pas d’accès', () => {
    expect(accesArgent([{ role: 'comptable' }], 'refuse')).toEqual({ acces: false, raison: 'coupe_par_toi' });
  });

  it('aucune ligne (collaborateur d’avant) : à activer, pas d’accès', () => {
    expect(accesArgent([{ role: 'comptable' }], null)).toEqual({ acces: false, raison: 'a_activer' });
    expect(accesArgent([{ role: 'associe' }], undefined)).toEqual({ acces: false, raison: 'a_activer' });
  });

  it('une valeur inconnue (reste de la version abandonnée) vaut « aucune ligne »', () => {
    for (const reste of ['comptable', 'associe', 'salarie', 'ARGENT', 'argent ', '']) {
      expect(accesArgent([{ role: 'comptable' }], reste)).toEqual({ acces: false, raison: 'a_activer' });
    }
  });

  it('plusieurs projets : un seul rôle comptable ou associé actuel suffit, la ligne décide', () => {
    expect(accesArgent([{ role: 'salarie' }, { role: 'associe' }], 'argent_auto')).toEqual({
      acces: true,
      raison: 'automatique',
    });
    expect(accesArgent([{ role: 'observateur' }, { role: 'comptable' }], 'refuse')).toEqual({
      acces: false,
      raison: 'coupe_par_toi',
    });
  });

  it('plus comptable ni associé nulle part : aucun accès, quelle que soit la ligne (null)', () => {
    expect(accesArgent([], 'argent')).toBeNull();
    expect(accesArgent([], 'argent_auto')).toBeNull();
    expect(accesArgent([{ role: 'observateur' }], 'argent')).toBeNull();
    expect(accesArgent([{ role: 'salarie' }], 'argent_auto')).toBeNull();
    expect(accesArgent([{ role: 'inconnu' }], null)).toBeNull();
  });
});
