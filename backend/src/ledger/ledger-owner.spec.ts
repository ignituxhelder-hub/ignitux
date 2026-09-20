import {
  IGNITUX,
  IGNITUX_OWNER_ID,
  describeOwner,
  isIgnitux,
  ownerColumns,
  ownerFromColumns,
  ownerWhere,
  sameOwner,
  userOwner,
} from './ledger-owner.js';

const ALICE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

describe('ledger-owner', () => {
  describe('aller-retour vers la base', () => {
    it("rend IGNITUX identifiable sans jamais le confondre avec une personne", () => {
      expect(ownerColumns(IGNITUX)).toEqual({
        owner_type: 'ignitux',
        owner_id: IGNITUX_OWNER_ID,
      });
      expect(ownerFromColumns(ownerColumns(IGNITUX))).toEqual(IGNITUX);
    });

    it('rend une personne à elle-même', () => {
      expect(ownerColumns(userOwner(ALICE))).toEqual({ owner_type: 'user', owner_id: ALICE });
      expect(ownerFromColumns(ownerColumns(userOwner(ALICE)))).toEqual(userOwner(ALICE));
    });

    it("n'attribue jamais l'identifiant sentinelle à un utilisateur", () => {
      // Une ligne « user » portant l'identifiant d'IGNITUX voudrait dire que
      // l'argent d'IGNITUX est passé du côté des personnes. On s'arrête
      // plutôt que de choisir un des deux sens.
      expect(() =>
        ownerFromColumns({ owner_type: 'user', owner_id: IGNITUX_OWNER_ID }),
      ).toThrow(/identifiant d'IGNITUX/);
    });

    it("refuse une ligne « ignitux » portant l'identifiant de quelqu'un", () => {
      expect(() => ownerFromColumns({ owner_type: 'ignitux', owner_id: ALICE })).toThrow(
        /incohérente/,
      );
    });

    it('refuse un type de propriétaire inconnu plutôt que de deviner', () => {
      // Le point important est qu'il n'existe aucune valeur par défaut
      // raisonnable : attribuer à IGNITUX lui donnerait l'argent de
      // quelqu'un, n'attribuer à personne contredirait la règle qui fonde
      // tout le module.
      expect(() => ownerFromColumns({ owner_type: 'associe', owner_id: ALICE })).toThrow(
        /Propriétaire inconnu/,
      );
    });
  });

  describe('comparaison', () => {
    it('ne confond pas IGNITUX avec une personne', () => {
      expect(sameOwner(IGNITUX, userOwner(ALICE))).toBe(false);
      expect(sameOwner(userOwner(ALICE), IGNITUX)).toBe(false);
    });

    it('ne confond pas deux personnes', () => {
      expect(sameOwner(userOwner(ALICE), userOwner(BOB))).toBe(false);
    });

    it('reconnaît le même propriétaire', () => {
      expect(sameOwner(IGNITUX, IGNITUX)).toBe(true);
      expect(sameOwner(userOwner(ALICE), userOwner(ALICE))).toBe(true);
    });

    it('sait dire lequel est IGNITUX', () => {
      expect(isIgnitux(IGNITUX)).toBe(true);
      expect(isIgnitux(userOwner(ALICE))).toBe(false);
    });
  });

  describe('lecture filtrée', () => {
    it('produit un filtre qui porte toujours sur les deux colonnes', () => {
      // Un filtre qui ne porterait que sur `owner_id` laisserait passer les
      // lignes d'IGNITUX le jour où un identifiant coïnciderait ; un filtre
      // qui ne porterait que sur `owner_type` rendrait les livres de tout le
      // monde. Les deux ensemble, toujours.
      const filtre = ownerWhere(userOwner(ALICE));
      expect(Object.keys(filtre).sort()).toEqual(['owner_id', 'owner_type']);
    });
  });

  describe('libellé', () => {
    it('nomme IGNITUX et les personnes de façon distinguable', () => {
      expect(describeOwner(IGNITUX)).toBe('IGNITUX');
      expect(describeOwner(userOwner(ALICE))).toContain(ALICE);
      expect(describeOwner(userOwner(ALICE))).not.toBe(describeOwner(userOwner(BOB)));
    });
  });
});
