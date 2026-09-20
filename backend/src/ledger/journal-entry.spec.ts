import {
  buildTransferSides,
  formatCents,
  totals,
  validateEntry,
  type AccountRef,
  type DraftLine,
} from './journal-entry.js';
import { IGNITUX, userOwner } from './ledger-owner.js';

const ALICE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

/** Deux comptes à Alice, deux à IGNITUX. */
const COMPTES = new Map<string, AccountRef>([
  ['alice-banque', { id: 'alice-banque', owner: userOwner(ALICE), currency: 'EUR' }],
  ['alice-ventes', { id: 'alice-ventes', owner: userOwner(ALICE), currency: 'EUR' }],
  ['alice-dollars', { id: 'alice-dollars', owner: userOwner(ALICE), currency: 'USD' }],
  ['ignitux-banque', { id: 'ignitux-banque', owner: IGNITUX, currency: 'EUR' }],
  ['ignitux-abo', { id: 'ignitux-abo', owner: IGNITUX, currency: 'EUR' }],
]);

function codes(lines: DraftLine[], owner = userOwner(ALICE), currency = 'EUR') {
  return validateEntry({ owner, currency, lines, accounts: COMPTES }).map((p) => p.code);
}

describe('validateEntry', () => {
  it('accepte une écriture équilibrée chez un seul propriétaire', () => {
    expect(
      codes([
        { accountId: 'alice-banque', debitCents: 12000, creditCents: 0 },
        { accountId: 'alice-ventes', debitCents: 0, creditCents: 12000 },
      ]),
    ).toEqual([]);
  });

  describe('la séparation des caisses', () => {
    it("refuse une écriture qui touche le compte d'un autre propriétaire", () => {
      // LE contrôle. Sans lui, cette écriture ferait entrer 120 € du chiffre
      // d'affaires d'Alice dans la trésorerie d'IGNITUX, en restant
      // parfaitement équilibrée — donc sans qu'aucun autre contrôle ne
      // s'en aperçoive.
      expect(
        codes([
          { accountId: 'ignitux-banque', debitCents: 12000, creditCents: 0 },
          { accountId: 'alice-ventes', debitCents: 0, creditCents: 12000 },
        ]),
      ).toContain('proprietaires-melanges');
    });

    it('refuse dans les deux sens', () => {
      expect(
        codes(
          [
            { accountId: 'ignitux-banque', debitCents: 500, creditCents: 0 },
            { accountId: 'alice-banque', debitCents: 0, creditCents: 500 },
          ],
          IGNITUX,
        ),
      ).toContain('proprietaires-melanges');
    });

    it('nomme les deux propriétaires dans le message, pas seulement le problème', () => {
      const [probleme] = validateEntry({
        owner: userOwner(ALICE),
        currency: 'EUR',
        lines: [
          { accountId: 'ignitux-banque', debitCents: 100, creditCents: 0 },
          { accountId: 'alice-ventes', debitCents: 0, creditCents: 100 },
        ],
        accounts: COMPTES,
      });
      expect(probleme.message).toContain('IGNITUX');
      expect(probleme.message).toContain(ALICE);
    });

    it("n'est pas masquée par un déséquilibre : les deux remontent", () => {
      // Renvoyer tous les problèmes plutôt que le premier : une écriture
      // corrigée problème par problème demande autant d'allers-retours
      // qu'il y a de problèmes.
      const resultat = codes([
        { accountId: 'ignitux-banque', debitCents: 100, creditCents: 0 },
        { accountId: 'alice-ventes', debitCents: 0, creditCents: 90 },
      ]);
      expect(resultat).toContain('proprietaires-melanges');
      expect(resultat).toContain('ecriture-desequilibree');
    });
  });

  describe('la partie double', () => {
    it('refuse une écriture déséquilibrée', () => {
      expect(
        codes([
          { accountId: 'alice-banque', debitCents: 10000, creditCents: 0 },
          { accountId: 'alice-ventes', debitCents: 0, creditCents: 9000 },
        ]),
      ).toEqual(['ecriture-desequilibree']);
    });

    it('refuse une écriture à une seule ligne, en le disant clairement', () => {
      // Le message générique « déséquilibrée » laisserait chercher ; celui-ci
      // dit ce qui manque.
      expect(codes([{ accountId: 'alice-banque', debitCents: 100, creditCents: 0 }])).toContain(
        'ligne-unique',
      );
    });

    it('refuse une écriture sans aucune ligne', () => {
      expect(codes([])).toEqual(['aucune-ligne']);
    });
  });

  describe('les montants', () => {
    it('refuse un montant négatif au lieu de le retourner', () => {
      // Un débit négatif est un crédit déguisé, et un crédit déguisé fausse
      // tout total qui additionne une colonne. Le sens se dit par la
      // colonne, jamais par un signe.
      expect(
        codes([
          { accountId: 'alice-banque', debitCents: -500, creditCents: 0 },
          { accountId: 'alice-ventes', debitCents: 0, creditCents: -500 },
        ]),
      ).toEqual(['montant-negatif', 'montant-negatif']);
    });

    it('refuse une ligne à la fois débitée et créditée', () => {
      expect(
        codes([
          { accountId: 'alice-banque', debitCents: 100, creditCents: 100 },
          { accountId: 'alice-ventes', debitCents: 0, creditCents: 0 },
        ]),
      ).toEqual(expect.arrayContaining(['sens-ambigu', 'ligne-vide']));
    });

    it('refuse les centimes fractionnaires', () => {
      expect(
        codes([
          { accountId: 'alice-banque', debitCents: 10.5, creditCents: 0 },
          { accountId: 'alice-ventes', debitCents: 0, creditCents: 10.5 },
        ]),
      ).toEqual(['montant-non-entier', 'montant-non-entier']);
    });
  });

  describe('les devises', () => {
    it("refuse de mélanger deux devises dans la même écriture", () => {
      expect(
        codes([
          { accountId: 'alice-banque', debitCents: 100, creditCents: 0 },
          { accountId: 'alice-dollars', debitCents: 0, creditCents: 100 },
        ]),
      ).toEqual(['devise-melangee']);
    });
  });

  describe('les comptes inconnus', () => {
    it('signale le compte inconnu sans se prononcer sur son propriétaire', () => {
      // On ne peut rien dire du mélange des caisses quand on ignore à qui
      // appartient la ligne : le contrôle s'arrête là plutôt que de deviner.
      const resultat = codes([
        { accountId: 'inexistant', debitCents: 100, creditCents: 0 },
        { accountId: 'alice-ventes', debitCents: 0, creditCents: 100 },
      ]);
      expect(resultat).toEqual(['compte-inconnu']);
      expect(resultat).not.toContain('proprietaires-melanges');
    });
  });
});

describe('totals', () => {
  it('additionne chaque colonne séparément', () => {
    expect(
      totals([
        { accountId: 'a', debitCents: 100, creditCents: 0 },
        { accountId: 'b', debitCents: 50, creditCents: 0 },
        { accountId: 'c', debitCents: 0, creditCents: 150 },
      ]),
    ).toEqual({ debitCents: 150, creditCents: 150 });
  });
});

describe('buildTransferSides', () => {
  it('produit deux écritures séparées, équilibrées chacune chez son propriétaire', () => {
    // La seule opération qui traverse la frontière ne la traverse justement
    // pas : elle produit deux écritures, une par comptabilité.
    const { from, to } = buildTransferSides({
      from: { owner: IGNITUX, debitedAccountId: 'ignitux-abo', creditedAccountId: 'ignitux-banque' },
      to: { owner: userOwner(ALICE), debitedAccountId: 'alice-banque', creditedAccountId: 'alice-ventes' },
      amountCents: 50000,
    });

    expect(from.owner).toEqual(IGNITUX);
    expect(to.owner).toEqual(userOwner(ALICE));
    expect(totals(from.lines)).toEqual({ debitCents: 50000, creditCents: 50000 });
    expect(totals(to.lines)).toEqual({ debitCents: 50000, creditCents: 50000 });

    // Et chaque côté ne touche que ses propres comptes.
    expect(codes(from.lines, IGNITUX)).toEqual([]);
    expect(codes(to.lines, userOwner(ALICE))).toEqual([]);
  });
});

describe('formatCents', () => {
  it('écrit des euros lisibles', () => {
    expect(formatCents(0)).toBe('0,00 €');
    expect(formatCents(5)).toBe('0,05 €');
    expect(formatCents(12345)).toBe('123,45 €');
    expect(formatCents(-250)).toBe('-2,50 €');
  });
});
