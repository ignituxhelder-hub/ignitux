import { GENERATOR_NAMES } from '../igini/usage/generator-names.js';
import {
  BAREME,
  CREDITS_BIENVENUE,
  creditsPourCout,
  prixEnCredits,
  presenterBareme,
  RECHARGES,
  VALEUR_CREDIT_CENTIMES,
} from './bareme.js';

describe('creditsPourCout — prix = coût IA × 5, en crédits de 0,10 €, arrondi au supérieur', () => {
  it('applique la règle : ceil(5 × coût / 0,10 €)', () => {
    // 0,0565 € × 5 = 0,2825 € → 2,825 crédits → 3.
    expect(creditsPourCout(56_500)).toBe(3);
    // 0,0914 € × 5 = 0,457 € → 4,57 crédits → 5.
    expect(creditsPourCout(91_400)).toBe(5);
  });

  it('un coût qui tombe juste ne prend pas un crédit de plus', () => {
    // 0,02 € × 5 = 0,10 € = exactement 1 crédit.
    expect(creditsPourCout(20_000)).toBe(1);
    expect(creditsPourCout(40_000)).toBe(2);
    // Un micro-euro au-dessus suffit à passer au crédit suivant.
    expect(creditsPourCout(40_001)).toBe(3);
  });

  it('ne descend jamais sous 1 crédit, même pour un appel presque gratuit', () => {
    expect(creditsPourCout(0)).toBe(1);
    expect(creditsPourCout(1)).toBe(1);
    expect(creditsPourCout(7_590)).toBe(1);
  });

  it('refuse un coût négatif, non entier ou non fini plutôt que d’inventer un prix', () => {
    expect(() => creditsPourCout(-1)).toThrow();
    expect(() => creditsPourCout(1.5)).toThrow();
    expect(() => creditsPourCout(Number.NaN)).toThrow();
    expect(() => creditsPourCout(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('BAREME — une seule table, lue par le serveur et exposée au frontend', () => {
  it('donne un prix à CHAQUE appel IA journalisé', () => {
    for (const nom of GENERATOR_NAMES) {
      expect(BAREME[nom], `${nom} n’a pas de prix`).toBeDefined();
    }
    expect(Object.keys(BAREME).sort()).toEqual([...GENERATOR_NAMES].sort());
  });

  it.each(Object.entries(BAREME))(
    '%s : le prix affiché est celui que la règle tire du coût de référence',
    (_nom, ligne) => {
      expect(ligne.credits).toBe(creditsPourCout(ligne.coutReferenceMicroEur));
      expect(Number.isInteger(ligne.credits)).toBe(true);
      expect(ligne.credits).toBeGreaterThanOrEqual(1);
      expect(ligne.libelle.trim().length).toBeGreaterThan(2);
      // La source dit d'où vient le coût : mesuré ou estimé, et comment.
      expect(ligne.source).toMatch(/mesuré|estimé/i);
    },
  );

  it('le chat se paie au message, tout le reste à l’action', () => {
    expect(BAREME.discuter.par).toBe('message');
    for (const [nom, ligne] of Object.entries(BAREME)) {
      if (nom !== 'discuter') expect(ligne.par).toBe('action');
    }
  });

  it('prixEnCredits lit la table', () => {
    expect(prixEnCredits('analyser')).toBe(BAREME.analyser.credits);
    expect(prixEnCredits('discuter')).toBe(BAREME.discuter.credits);
  });
});

describe('les constantes de l’offre de crédits', () => {
  it('1 crédit = 0,10 €, 30 crédits offerts, recharges 10/20/50 €', () => {
    expect(VALEUR_CREDIT_CENTIMES).toBe(10);
    expect(CREDITS_BIENVENUE).toBe(30);
    expect(RECHARGES).toEqual([
      { prixCentimes: 1000, credits: 100 },
      { prixCentimes: 2000, credits: 200 },
      { prixCentimes: 5000, credits: 500 },
    ]);
    // Une recharge ne vend jamais un crédit à un autre prix que sa valeur.
    for (const recharge of RECHARGES) {
      expect(recharge.prixCentimes).toBe(recharge.credits * VALEUR_CREDIT_CENTIMES);
    }
  });
});

describe('presenterBareme — ce que voit le frontend', () => {
  it('rend le prix de chaque action, sans le coût de référence', () => {
    const vu = presenterBareme();
    expect(vu.actions.map((a) => a.generateur).sort()).toEqual([...GENERATOR_NAMES].sort());
    for (const action of vu.actions) {
      expect(action).toEqual({
        generateur: action.generateur,
        libelle: BAREME[action.generateur].libelle,
        credits: BAREME[action.generateur].credits,
        par: BAREME[action.generateur].par,
      });
    }
    // Le coût interne d'Ignitux ne sort pas : seule la règle est publique.
    expect(JSON.stringify(vu)).not.toContain('coutReference');
  });

  it('dit que la recharge n’est pas encore possible, et pourquoi', () => {
    const vu = presenterBareme();
    expect(vu.rechargeDisponible).toBe(false);
    expect(vu.rechargeMessage).toBe(
      'Bientôt disponible — le paiement par carte arrive dès que l’entreprise Ignitux sera immatriculée.',
    );
    expect(vu.valeurCreditCentimes).toBe(10);
    expect(vu.bienvenue).toBe(30);
    expect(vu.recharges).toEqual(RECHARGES);
  });
});
