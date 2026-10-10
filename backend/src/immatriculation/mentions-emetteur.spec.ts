import { capitalConnuCents, propositionCapital } from './capital.js';
import { formaterEuros, mentionsEmetteur } from './mentions-emetteur.js';

describe('formaterEuros', () => {
  it.each([
    [100, '1,00 €'],
    [100000, '1 000,00 €'],
    [123456789, '1 234 567,89 €'],
    [5, '0,05 €'],
  ])('%i centimes → %s', (cents, attendu) => {
    expect(formaterEuros(cents)).toBe(attendu);
  });
});

describe('mentionsEmetteur', () => {
  const base = {
    legalName: 'Ma Société',
    legalForm: 'SAS',
    capitalCents: 500000,
    headOffice: '1 rue de la Paix, 75002 Paris',
    siren: '443061841',
    siret: '44306184100013',
    vatNumber: 'FR64443061841',
  };

  it('écrit toutes les mentions connues, une par ligne', () => {
    expect(mentionsEmetteur(base).split('\n')).toEqual([
      'Ma Société',
      'SAS au capital de 5 000,00 €',
      'Siège : 1 rue de la Paix, 75002 Paris',
      'SIREN : 443 061 841',
      'SIRET : 443 061 841 00013',
      'TVA intracommunautaire : FR64443061841',
    ]);
  });

  it('n’invente rien : une information absente est une ligne absente', () => {
    expect(
      mentionsEmetteur({ ...base, legalForm: null, capitalCents: null, siret: null, vatNumber: null }).split('\n'),
    ).toEqual(['Ma Société', 'Siège : 1 rue de la Paix, 75002 Paris', 'SIREN : 443 061 841']);
  });

  it('société sans capital connu : la forme seule', () => {
    expect(mentionsEmetteur({ ...base, legalForm: 'SASU', capitalCents: null })).toContain('\nSASU\nSiège');
  });

  it.each(['micro-entreprise', 'EI'])(
    '%s : la mention légale « Entrepreneur individuel (EI) », jamais de ligne de capital',
    (forme) => {
      // Même si un capital traînait dans la source : une EI n'en a pas.
      const lignes = mentionsEmetteur({ ...base, legalForm: forme, capitalCents: 100000 }).split('\n');
      expect(lignes[1]).toBe('Entrepreneur individuel (EI)');
      expect(lignes.join('\n')).not.toContain('capital');
      expect(lignes.join('\n')).not.toContain('micro-entreprise');
    },
  );
});

describe('capitalConnuCents', () => {
  const retenus = { status: 'retenue', legal_form: 'SASU', capital_cents: 100000 };
  it('statuts retenus pour la forme confirmée : le capital', () => {
    expect(capitalConnuCents('SASU', retenus)).toBe(100000);
  });
  it('statuts en brouillon : inconnu', () => {
    expect(capitalConnuCents('SASU', { ...retenus, status: 'brouillon' })).toBeNull();
  });
  it('statuts absents : inconnu', () => {
    expect(capitalConnuCents('SASU', null)).toBeNull();
  });
  it('statuts restés d’une autre forme : inconnu', () => {
    expect(capitalConnuCents('SAS', retenus)).toBeNull();
  });
  it.each(['micro-entreprise', 'EI', null])('forme %s : inconnu', (forme) => {
    expect(capitalConnuCents(forme, retenus)).toBeNull();
  });
});

describe('propositionCapital', () => {
  it('Débit 512 / Crédit 101 du montant du capital, à la date d’immatriculation', () => {
    const p = propositionCapital({
      formeConfirmee: 'SASU',
      statuts: { status: 'retenue', legal_form: 'SASU', capital_cents: 100000 },
      legalName: 'Ma Société',
      registeredOn: new Date('2026-10-01T00:00:00Z'),
    });
    expect(p).toEqual({
      montantCents: 100000,
      libelle: 'Apport en capital — Ma Société',
      date: '2026-10-01',
      lignes: [
        { compte: '512', libelleCompte: 'Banque — compte principal', natureCompte: 'actif', debitCents: 100000, creditCents: 0 },
        { compte: '101', libelleCompte: 'Capital', natureCompte: 'capitaux', debitCents: 0, creditCents: 100000 },
      ],
    });
  });

  it('rien sans capital connu', () => {
    expect(
      propositionCapital({
        formeConfirmee: 'EI',
        statuts: null,
        legalName: 'X',
        registeredOn: new Date('2026-10-01T00:00:00Z'),
      }),
    ).toBeNull();
  });
});
