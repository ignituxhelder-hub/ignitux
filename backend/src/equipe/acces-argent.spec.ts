import { ACCES_ARGENT_AUTOMATIQUE_DEPUIS, accesArgent, CHOIX_ACCES_ARGENT } from './acces-argent.js';

const AVANT = new Date('2026-10-14T21:59:59.999Z'); // 14/10/2026 23:59:59,999 à Paris
const PILE = new Date('2026-10-14T22:00:00.000Z'); // 15/10/2026 00:00 à Paris
const APRES = new Date('2026-11-02T09:00:00.000Z');

describe('accesArgent — accès automatique ou activé (décision du 2026-10-14)', () => {
  it('la date limite est le 15/10/2026 à minuit, heure de Paris', () => {
    expect(ACCES_ARGENT_AUTOMATIQUE_DEPUIS.toISOString()).toBe('2026-10-14T22:00:00.000Z');
    expect(CHOIX_ACCES_ARGENT).toEqual({ active: 'argent', coupe: 'refuse' });
  });

  it('(a) activé par le propriétaire : accès, même pour un collaborateur d’avant', () => {
    expect(accesArgent([{ role: 'comptable', created_at: AVANT }], 'argent')).toEqual({
      acces: true,
      raison: 'active_par_toi',
    });
  });

  it('(b) ajouté à partir de la date limite, sans choix : accès automatique', () => {
    expect(accesArgent([{ role: 'associe', created_at: PILE }], null)).toEqual({ acces: true, raison: 'automatique' });
    expect(accesArgent([{ role: 'comptable', created_at: APRES }], undefined)).toEqual({
      acces: true,
      raison: 'automatique',
    });
  });

  it('ajouté avant la date limite, sans choix : à activer (pas d’accès)', () => {
    expect(accesArgent([{ role: 'comptable', created_at: AVANT }], null)).toEqual({
      acces: false,
      raison: 'a_activer',
    });
  });

  it('une ligne sans date compte comme ancienne (côté prudent)', () => {
    expect(accesArgent([{ role: 'associe', created_at: null }], null)).toEqual({ acces: false, raison: 'a_activer' });
  });

  it('coupé par le propriétaire : pas d’accès, même invité après la date limite', () => {
    expect(accesArgent([{ role: 'comptable', created_at: APRES }], 'refuse')).toEqual({
      acces: false,
      raison: 'coupe_par_toi',
    });
  });

  it('plusieurs projets : une seule ligne récente comptable ou associé suffit', () => {
    expect(
      accesArgent(
        [
          { role: 'comptable', created_at: AVANT },
          { role: 'associe', created_at: APRES },
        ],
        null,
      ),
    ).toEqual({ acces: true, raison: 'automatique' });
  });

  it('seule la date d’une ligne dont le rôle ACTUEL ouvre l’argent compte', () => {
    // Récent comme salarié, ancien comme comptable : l'invitation récente ne
    // parlait pas d'argent, il faut une activation.
    expect(
      accesArgent(
        [
          { role: 'salarie', created_at: APRES },
          { role: 'comptable', created_at: AVANT },
        ],
        null,
      ),
    ).toEqual({ acces: false, raison: 'a_activer' });
  });

  it('plus comptable ni associé nulle part : aucun accès, même activé (null)', () => {
    expect(accesArgent([], 'argent')).toBeNull();
    expect(accesArgent([{ role: 'observateur', created_at: APRES }], 'argent')).toBeNull();
    expect(accesArgent([{ role: 'salarie', created_at: APRES }], null)).toBeNull();
  });

  it('un choix inconnu (reste de la version abandonnée) vaut « aucun choix »', () => {
    expect(accesArgent([{ role: 'comptable', created_at: AVANT }], 'comptable')).toEqual({
      acces: false,
      raison: 'a_activer',
    });
    expect(accesArgent([{ role: 'comptable', created_at: APRES }], 'salarie')).toEqual({
      acces: true,
      raison: 'automatique',
    });
  });
});
