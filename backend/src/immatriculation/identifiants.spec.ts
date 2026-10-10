import {
  cleTvaFrancaise,
  lireDateIso,
  luhnValide,
  normaliserFiche,
  verifierSiren,
  verifierSiret,
  verifierTva,
} from './identifiants.js';

describe('luhnValide', () => {
  it.each(['443061841', '732829320', '44306184100013'])('accepte %s', (n) => {
    expect(luhnValide(n)).toBe(true);
  });
  it.each(['443061842', '123456789', '', '44306184100014', '4430618a1'])('refuse « %s »', (n) => {
    expect(luhnValide(n)).toBe(false);
  });
});

describe('verifierSiren', () => {
  it('tolère et retire les espaces de saisie', () => {
    expect(verifierSiren(' 443 061 841 ')).toEqual({ ok: true, valeur: '443061841' });
  });
  it.each(['44306184', '4430618411', 'ABCDEFGHI'])('refuse une longueur ou des caractères faux (%s)', (n) => {
    const r = verifierSiren(n);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('9 chiffres');
  });
  it('refuse une clé de Luhn fausse', () => {
    const r = verifierSiren('443061842');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('clé de contrôle');
  });
});

describe('verifierSiret', () => {
  it('accepte un SIRET valide qui commence par le SIREN', () => {
    expect(verifierSiret('443 061 841 00013', '443061841')).toEqual({ ok: true, valeur: '44306184100013' });
  });
  it('refuse une longueur fausse', () => {
    expect(verifierSiret('4430618410001', '443061841').ok).toBe(false);
  });
  it('refuse un SIRET dont les 9 premiers chiffres ne sont pas le SIREN', () => {
    const r = verifierSiret('73282932000074', '443061841');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('SIREN');
  });
  it('refuse une clé de Luhn fausse', () => {
    const r = verifierSiret('44306184100014', '443061841');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('clé de contrôle');
  });
  it('La Poste : message clair, exception non gérée', () => {
    const r = verifierSiret('35600000000049', '356000000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('La Poste');
  });
});

describe('verifierTva', () => {
  it('calcule la clé numérique française', () => {
    expect(cleTvaFrancaise('443061841')).toBe(64);
  });
  it('accepte une clé numérique juste, en majuscules et sans espaces', () => {
    expect(verifierTva('fr 64 443061841', '443061841')).toEqual({ ok: true, valeur: 'FR64443061841' });
  });
  it('refuse une clé numérique fausse', () => {
    const r = verifierTva('FR65443061841', '443061841');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('clé');
  });
  it('accepte une clé alphanumérique sans la vérifier', () => {
    expect(verifierTva('FRA4443061841', '443061841').ok).toBe(true);
  });
  it('refuse un numéro qui ne se termine pas par le SIREN', () => {
    expect(verifierTva('FR64732829320', '443061841').ok).toBe(false);
  });
  it('refuse un numéro mal formé', () => {
    expect(verifierTva('DE123456789', '443061841').ok).toBe(false);
    expect(verifierTva('FR6444306184', '443061841').ok).toBe(false);
  });
});

describe('lireDateIso', () => {
  it('lit une date réelle', () => {
    expect(lireDateIso('2026-10-01')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
  it.each(['2026-02-30', '2026-13-01', '01/10/2026', ''])('refuse « %s »', (d) => {
    expect(lireDateIso(d)).toBeNull();
  });
});

describe('normaliserFiche', () => {
  const maintenant = new Date('2026-10-10T12:00:00Z');
  const saisie = {
    siren: '443 061 841',
    siret: '',
    vatNumber: null,
    legalName: '  Ma Société  ',
    headOffice: '1 rue de la Paix, 75002 Paris',
    registeredOn: '2026-10-01',
  };

  it('normalise une fiche valide (SIRET et TVA facultatifs)', () => {
    const r = normaliserFiche(saisie, maintenant);
    expect(r).toEqual({
      ok: true,
      fiche: {
        siren: '443061841',
        siret: null,
        vatNumber: null,
        legalName: 'Ma Société',
        headOffice: '1 rue de la Paix, 75002 Paris',
        registeredOn: new Date('2026-10-01T00:00:00Z'),
      },
    });
  });

  it('rend toutes les erreurs d’un coup', () => {
    const r = normaliserFiche(
      { ...saisie, siren: '443061842', legalName: '   ', headOffice: 'x'.repeat(301), registeredOn: '1999-12-31' },
      maintenant,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toHaveLength(4);
  });

  it('accepte demain (décalage horaire) mais pas après-demain', () => {
    expect(normaliserFiche({ ...saisie, registeredOn: '2026-10-11' }, maintenant).ok).toBe(true);
    expect(normaliserFiche({ ...saisie, registeredOn: '2026-10-12' }, maintenant).ok).toBe(false);
  });

  it('accepte le 1er janvier 2000, pas la veille', () => {
    expect(normaliserFiche({ ...saisie, registeredOn: '2000-01-01' }, maintenant).ok).toBe(true);
    expect(normaliserFiche({ ...saisie, registeredOn: '1999-12-31' }, maintenant).ok).toBe(false);
  });

  it('vérifie SIRET et TVA contre le SIREN saisi', () => {
    const r = normaliserFiche({ ...saisie, siret: '73282932000074', vatNumber: 'FR65443061841' }, maintenant);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toHaveLength(2);
  });
});
