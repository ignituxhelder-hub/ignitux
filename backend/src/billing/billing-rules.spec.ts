import {
  canTransition,
  computeTotals,
  DOCUMENT_STATUSES,
  formatDocumentNumber,
  isFrozen,
  lineSubtotalCents,
  lineVatCents,
  remainingCents,
  toCsv,
} from './billing-rules.js';

function line(quantityMilli: number, unitPriceCents: number, vatRateBasisPoints = 0) {
  return { quantity_milli: quantityMilli, unit_price_cents: unitPriceCents, vat_rate_basis_points: vatRateBasisPoints };
}

describe('calculs de facturation', () => {
  it('calcule un total de ligne avec une quantité fractionnaire', () => {
    // 1,5 × 100,00 € = 150,00 €
    expect(lineSubtotalCents(line(1500, 10000))).toBe(15000);
  });

  it('gère un taux de TVA à décimale sans flottant', () => {
    // 5,5 % de 100,00 € = 5,50 €
    expect(lineVatCents(line(1000, 10000, 550))).toBe(550);
  });

  it("n'accumule pas d'erreur de virgule flottante sur des centimes", () => {
    // Le cas classique : 0,10 € + 0,20 € doit valoir exactement 0,30 €.
    const totals = computeTotals([line(1000, 10), line(1000, 20)]);

    expect(totals.subtotalCents).toBe(30);
  });

  it('arrondit à la ligne et non au total', () => {
    // 5,5 % de 0,33 € = 0,01815 € → 0,02 € par ligne, soit 0,06 € sur
    // trois lignes. Arrondir une seule fois au total donnerait 0,05 € :
    // un centime d'écart que le client voit en recalculant.
    const totals = computeTotals([line(1000, 33, 550), line(1000, 33, 550), line(1000, 33, 550)]);

    expect(totals.vatCents).toBe(6);
  });

  it('interprète le taux en points de base : 2000 vaut bien 20 %', () => {
    expect(lineVatCents(line(1000, 10000, 2000))).toBe(2000);
  });

  it('additionne sous-total, TVA et total', () => {
    const totals = computeTotals([line(2000, 5000, 2000)]);

    expect(totals.subtotalCents).toBe(10000);
    expect(totals.vatCents).toBe(2000);
    expect(totals.totalCents).toBe(12000);
  });

  it('accepte une ligne négative pour représenter une remise', () => {
    expect(computeTotals([line(1000, 10000), line(1000, -2000)]).subtotalCents).toBe(8000);
  });

  it('renvoie des totaux nuls sans ligne', () => {
    expect(computeTotals([])).toEqual({ subtotalCents: 0, vatCents: 0, totalCents: 0 });
  });
});

describe('reste dû', () => {
  it('soustrait les règlements du total', () => {
    expect(remainingCents(12000, [{ amount_cents: 5000 }])).toBe(7000);
  });

  it('laisse apparaître un trop-perçu en négatif', () => {
    // Un trop-perçu masqué est un trop-perçu jamais remboursé.
    expect(remainingCents(10000, [{ amount_cents: 12000 }])).toBe(-2000);
  });

  it('vaut le total quand rien n\'a été réglé', () => {
    expect(remainingCents(10000, [])).toBe(10000);
  });
});

describe('numérotation', () => {
  it('préfixe par type et remplit la séquence à quatre chiffres', () => {
    expect(formatDocumentNumber('facture', 2026, 7)).toBe('FAC-2026-0007');
    expect(formatDocumentNumber('devis', 2026, 7)).toBe('DEV-2026-0007');
    expect(formatDocumentNumber('avoir', 2026, 12)).toBe('AV-2026-0012');
  });

  it('ne tronque pas au-delà de quatre chiffres', () => {
    expect(formatDocumentNumber('facture', 2026, 12345)).toBe('FAC-2026-12345');
  });
});

describe('transitions de statut', () => {
  it('permet de passer un brouillon à émis', () => {
    expect(canTransition('brouillon', 'emis')).toBe(true);
  });

  it("interdit de ramener un document émis à l'état de brouillon", () => {
    // Sinon on pourrait « libérer » un numéro déjà attribué, et la
    // numérotation sans trou ne voudrait plus rien dire.
    expect(canTransition('emis', 'brouillon')).toBe(false);
    expect(canTransition('paye', 'brouillon')).toBe(false);
  });

  it('fige définitivement un document payé, annulé ou refusé', () => {
    for (const status of ['paye', 'annule', 'refuse'] as const) {
      for (const target of DOCUMENT_STATUSES) {
        expect(canTransition(status, target)).toBe(false);
      }
    }
  });

  it('considère tout ce qui dépasse le brouillon comme figé', () => {
    expect(isFrozen('brouillon')).toBe(false);
    expect(isFrozen('emis')).toBe(true);
    expect(isFrozen('paye')).toBe(true);
    expect(isFrozen('annule')).toBe(true);
  });
});

describe('export CSV', () => {
  it('écrit les montants en euros avec deux décimales', () => {
    const csv = toCsv([
      {
        number: 'FAC-2026-0001',
        type: 'facture',
        status: 'paye',
        client_name: 'Dupont',
        issued_at: new Date('2026-03-04T10:00:00Z'),
        totalCents: 12345,
      },
    ]);

    expect(csv).toContain('FAC-2026-0001;facture;paye;Dupont;2026-03-04;123.45');
  });

  it('échappe un nom de client contenant un point-virgule', () => {
    // Sans échappement, le fichier serait décalé d'une colonne.
    const csv = toCsv([
      {
        number: 'FAC-2026-0001',
        type: 'facture',
        status: 'emis',
        client_name: 'Dupont; et fils',
        issued_at: null,
        totalCents: 100,
      },
    ]);

    expect(csv).toContain('"Dupont; et fils"');
  });

  it('double les guillemets internes', () => {
    const csv = toCsv([
      {
        number: 'FAC-2026-0001',
        type: 'facture',
        status: 'emis',
        client_name: 'Société "Étoile"',
        issued_at: null,
        totalCents: 100,
      },
    ]);

    expect(csv).toContain('"Société ""Étoile"""');
  });

  it("laisse la date vide pour un document non émis", () => {
    const csv = toCsv([
      {
        number: 'DEV-2026-0001',
        type: 'devis',
        status: 'brouillon',
        client_name: 'Dupont',
        issued_at: null,
        totalCents: 100,
      },
    ]);

    expect(csv).toContain('Dupont;;1.00');
  });

  it('écrit un en-tête même sans ligne', () => {
    expect(toCsv([])).toBe('numero;type;statut;client;date_emission;total_ttc');
  });
});
