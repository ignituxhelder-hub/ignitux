import {
  DEFAULT_ENTRY_SPLIT,
  DEFAULT_DIVIDEND_RIGHT_BASIS_POINTS,
  dividendRightDueCents,
  participationPhase,
  validateAgreementTerms,
  validateMilestoneTarget,
} from './participation-model.js';

describe('participation-model', () => {
  describe('validateAgreementTerms', () => {
    it('accepte la structure de départ par défaut (51/49, 5 %)', () => {
      expect(
        validateAgreementTerms({
          founderBasisPoints: DEFAULT_ENTRY_SPLIT.founderBasisPoints,
          ignituxBasisPoints: DEFAULT_ENTRY_SPLIT.ignituxBasisPoints,
          dividendRightBasisPoints: DEFAULT_DIVIDEND_RIGHT_BASIS_POINTS,
        }),
      ).toEqual([]);
    });

    it('accepte une autre répartition de départ tant que le porteur reste majoritaire', () => {
      expect(
        validateAgreementTerms({
          founderBasisPoints: 6000,
          ignituxBasisPoints: 4000,
          dividendRightBasisPoints: 500,
        }),
      ).toEqual([]);
    });

    it('refuse une répartition qui ne fait pas 100 %', () => {
      const problems = validateAgreementTerms({
        founderBasisPoints: 5100,
        ignituxBasisPoints: 4800,
        dividendRightBasisPoints: 500,
      });
      expect(problems.map((p) => p.code)).toContain('total-incorrect');
    });

    it('refuse un porteur à 50 % ou moins au départ', () => {
      const problems = validateAgreementTerms({
        founderBasisPoints: 5000,
        ignituxBasisPoints: 5000,
        dividendRightBasisPoints: 500,
      });
      expect(problems.map((p) => p.code)).toContain('porteur-non-majoritaire');
    });

    it('refuse un droit sur les dividendes hors de 0–100 %', () => {
      const problems = validateAgreementTerms({
        founderBasisPoints: 5100,
        ignituxBasisPoints: 4900,
        dividendRightBasisPoints: 10001,
      });
      expect(problems.map((p) => p.code)).toContain('droit-dividendes-invalide');
    });

    it('refuse des parts non entières (pas de flottant)', () => {
      const problems = validateAgreementTerms({
        founderBasisPoints: 5100.5,
        ignituxBasisPoints: 4899.5,
        dividendRightBasisPoints: 500,
      });
      expect(problems.map((p) => p.code)).toContain('non-entier');
    });
  });

  describe('validateMilestoneTarget', () => {
    it('accepte une baisse de la part d’IGNITUX, quelle que soit sa valeur', () => {
      expect(validateMilestoneTarget(4900, 4000)).toEqual([]);
      expect(validateMilestoneTarget(4900, 3733)).toEqual([]);
      expect(validateMilestoneTarget(2000, 0)).toEqual([]);
    });

    it('refuse que la part d’IGNITUX remonte', () => {
      expect(validateMilestoneTarget(2000, 3000).map((p) => p.code)).toContain('ignitux-remonte');
    });

    it('refuse un palier qui ne change rien', () => {
      expect(validateMilestoneTarget(2000, 2000).map((p) => p.code)).toContain('ignitux-remonte');
    });

    it('refuse une cible hors de 0–100 %', () => {
      expect(validateMilestoneTarget(2000, -1).map((p) => p.code)).toContain('cible-invalide');
    });
  });

  describe('participationPhase', () => {
    it('est « partagée » tant qu’IGNITUX détient du capital', () => {
      expect(participationPhase(4900)).toBe('partagee');
      expect(participationPhase(1)).toBe('partagee');
    });

    it('est « transmise » exactement quand IGNITUX est à 0 %', () => {
      expect(participationPhase(0)).toBe('transmise');
    });

    it('ne se prononce pas sans donnée', () => {
      expect(participationPhase(null)).toBe('inconnue');
    });
  });

  describe('dividendRightDueCents', () => {
    it('10 000 € distribués à 5 % → 500 €', () => {
      expect(dividendRightDueCents(1_000_000, 500)).toBe(50_000);
    });

    it('aucun dividende distribué → rien à payer', () => {
      expect(dividendRightDueCents(0, 500)).toBe(0);
    });

    it('arrondit au centime le plus proche', () => {
      // 5 % de 0,10 € = 0,005 € → 1 centime ; 5 % de 0,09 € = 0,0045 € → 0
      expect(dividendRightDueCents(10, 500)).toBe(1);
      expect(dividendRightDueCents(9, 500)).toBe(0);
    });

    it('utilise le taux de l’accord, pas une constante', () => {
      expect(dividendRightDueCents(1_000_000, 300)).toBe(30_000);
    });

    it('refuse un montant négatif ou non entier', () => {
      expect(() => dividendRightDueCents(-1, 500)).toThrow();
      expect(() => dividendRightDueCents(10.5, 500)).toThrow();
    });
  });
});
