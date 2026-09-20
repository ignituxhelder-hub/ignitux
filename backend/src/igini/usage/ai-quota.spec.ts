import { MICRO_EUR_PER_EUR } from './ai-pricing.js';
import {
  checkQuota,
  DEFAULT_CALLS_PER_MONTH,
  DEFAULT_COST_MICRO_EUR_PER_MONTH,
  readQuotaLimits,
  shouldWarn,
  type QuotaLimits,
} from './ai-quota.js';

const plafonds = (calls: number | null, euros: number | null): QuotaLimits => ({
  callsPerMonth: calls,
  costMicroEurPerMonth: euros === null ? null : euros * MICRO_EUR_PER_EUR,
});

describe('readQuotaLimits', () => {
  it("retombe sur l'offre annoncée quand rien n'est configuré", () => {
    expect(readQuotaLimits({})).toEqual({
      callsPerMonth: DEFAULT_CALLS_PER_MONTH,
      costMicroEurPerMonth: DEFAULT_COST_MICRO_EUR_PER_MONTH,
    });
  });

  it('lit les deux plafonds depuis l’environnement', () => {
    expect(
      readQuotaLimits({ IGINI_QUOTA_CALLS_PER_MONTH: '20', IGINI_QUOTA_COST_EUR_PER_MONTH: '7.5' }),
    ).toEqual({ callsPerMonth: 20, costMicroEurPerMonth: 7_500_000 });
  });

  it('accepte « illimite » pour désactiver un axe', () => {
    const limites = readQuotaLimits({
      IGINI_QUOTA_CALLS_PER_MONTH: 'illimite',
      IGINI_QUOTA_COST_EUR_PER_MONTH: 'ILLIMITE',
    });
    expect(limites).toEqual({ callsPerMonth: null, costMicroEurPerMonth: null });
  });

  it('accepte zéro, qui ferme le robinet', () => {
    // Distinct d'« illimité » : zéro est une décision, pas une absence.
    expect(readQuotaLimits({ IGINI_QUOTA_CALLS_PER_MONTH: '0' }).callsPerMonth).toBe(0);
  });

  describe('une valeur illisible ne désactive PAS le plafond', () => {
    // Le point qui compte. Une faute de frappe dans une variable
    // d'environnement ne doit pas ouvrir les vannes en silence — c'est le
    // sens de repli inverse de celui de l'interrupteur des générateurs, et
    // dans les deux cas l'inattendu penche du côté prudent.
    it.each(['abc', '-3', '2.5', ' ', 'true'])('« %s » retombe sur le défaut', (valeur) => {
      expect(readQuotaLimits({ IGINI_QUOTA_CALLS_PER_MONTH: valeur }).callsPerMonth).toBe(
        DEFAULT_CALLS_PER_MONTH,
      );
    });

    it('y compris pour le coût', () => {
      expect(
        readQuotaLimits({ IGINI_QUOTA_COST_EUR_PER_MONTH: 'gratuit' }).costMicroEurPerMonth,
      ).toBe(DEFAULT_COST_MICRO_EUR_PER_MONTH);
    });
  });
});

describe('checkQuota', () => {
  describe('le plafond du nombre d’analyses', () => {
    it('laisse passer tant qu’il en reste', () => {
      const verdict = checkQuota({ calls: 3, costMicroEur: 100000 }, plafonds(5, 2));
      expect(verdict.allowed).toBe(true);
      expect(verdict.remaining.calls).toBe(2);
    });

    it('refuse au cinquième appel, pas au sixième', () => {
      // « 5 analyses incluses » veut dire cinq, pas six. Le refus tombe
      // quand le cinquième est déjà consommé.
      expect(checkQuota({ calls: 4, costMicroEur: 0 }, plafonds(5, 2)).allowed).toBe(true);
      expect(checkQuota({ calls: 5, costMicroEur: 0 }, plafonds(5, 2)).allowed).toBe(false);
    });

    it('dit ce qui est arrivé, et quand ça repart', () => {
      const verdict = checkQuota({ calls: 5, costMicroEur: 0 }, plafonds(5, 2));
      expect(verdict.breach).toBe('appels');
      expect(verdict.reason).toContain('5 analyses');
      expect(verdict.reason).toContain('mois prochain');
    });
  });

  describe('le plafond de coût', () => {
    it('refuse quand le budget est consommé, même s’il reste des appels', () => {
      // Les deux plafonds ne protègent pas la même chose : un appel peut
      // coûter dix fois plus qu'un autre, donc compter les appels ne protège
      // pas la marge.
      const verdict = checkQuota({ calls: 1, costMicroEur: 2_000_000 }, plafonds(5, 2));
      expect(verdict.allowed).toBe(false);
      expect(verdict.breach).toBe('cout');
      expect(verdict.remaining.calls).toBe(4);
    });

    it('annonce le plafond en euros lisibles', () => {
      const verdict = checkQuota({ calls: 1, costMicroEur: 2_000_000 }, plafonds(5, 2));
      expect(verdict.reason).toContain('2,00 €');
    });
  });

  describe('lequel des deux parle en premier', () => {
    it('le nombre d’analyses, parce que c’est ce que l’offre annonce', () => {
      // Quand les deux sont atteints, on oppose celui que la personne
      // comprendra le plus vite.
      const verdict = checkQuota({ calls: 9, costMicroEur: 9_000_000 }, plafonds(5, 2));
      expect(verdict.breach).toBe('appels');
    });
  });

  describe('quand un coût est inconnu', () => {
    it('laisse passer, et le dit au lieu de faire semblant', () => {
      // Un modèle absent de la grille rend le coût du mois incalculable.
      // Refuser reviendrait à couper le service pour un défaut de
      // configuration qui ne concerne pas la personne.
      const verdict = checkQuota({ calls: 1, costMicroEur: null }, plafonds(5, 2));
      expect(verdict.allowed).toBe(true);
      // null se lit « plafond de coût non applicable », pas « il reste de la
      // marge ».
      expect(verdict.remaining.costMicroEur).toBeNull();
    });

    it('mais le plafond du nombre d’appels, lui, reste exact', () => {
      const verdict = checkQuota({ calls: 5, costMicroEur: null }, plafonds(5, 2));
      expect(verdict.allowed).toBe(false);
      expect(verdict.breach).toBe('appels');
    });
  });

  describe('sans plafond', () => {
    it('ne refuse jamais, et ne promet aucun reste', () => {
      const verdict = checkQuota({ calls: 10_000, costMicroEur: 99_000_000 }, plafonds(null, null));
      expect(verdict.allowed).toBe(true);
      expect(verdict.remaining).toEqual({ calls: null, costMicroEur: null });
    });
  });

  describe('plafond à zéro', () => {
    it('refuse dès le premier appel', () => {
      expect(checkQuota({ calls: 0, costMicroEur: 0 }, plafonds(0, 2)).allowed).toBe(false);
    });
  });
});

describe('shouldWarn', () => {
  it('prévient au dernier appel restant', () => {
    expect(shouldWarn(checkQuota({ calls: 4, costMicroEur: 0 }, plafonds(5, 2)))).toBe(true);
  });

  it('ne prévient pas quand il en reste largement', () => {
    expect(shouldWarn(checkQuota({ calls: 1, costMicroEur: 0 }, plafonds(5, 2)))).toBe(false);
  });

  it('prévient au dernier cinquième du budget', () => {
    // 1 650 000 sur 2 000 000 : il reste 350 000, soit moins du cinquième.
    expect(shouldWarn(checkQuota({ calls: 1, costMicroEur: 1_650_000 }, plafonds(5, 2)))).toBe(true);
  });

  it('ne prévient plus une fois le mur atteint', () => {
    // Ce n'est plus un avertissement à ce stade, c'est un refus — et il
    // porte son propre message.
    expect(shouldWarn(checkQuota({ calls: 5, costMicroEur: 0 }, plafonds(5, 2)))).toBe(false);
  });

  it('ne prévient pas quand aucun plafond ne s’applique', () => {
    expect(shouldWarn(checkQuota({ calls: 999, costMicroEur: null }, plafonds(null, null)))).toBe(
      false,
    );
  });
});
