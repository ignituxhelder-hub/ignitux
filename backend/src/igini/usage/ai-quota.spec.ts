import { MICRO_EUR_PER_EUR } from './ai-pricing.js';
import {
  checkQuota,
  CODE_PLAFOND_SECURITE,
  DEFAULT_COST_MICRO_EUR_PER_MONTH,
  readQuotaLimits,
  shouldWarn,
  type QuotaLimits,
} from './ai-quota.js';

const plafond = (euros: number | null): QuotaLimits => ({
  costMicroEurPerMonth: euros === null ? null : euros * MICRO_EUR_PER_EUR,
});

describe('readQuotaLimits', () => {
  it('retombe sur le garde-fou par défaut quand rien n’est configuré', () => {
    expect(readQuotaLimits({})).toEqual({ costMicroEurPerMonth: DEFAULT_COST_MICRO_EUR_PER_MONTH });
  });

  it('le défaut est haut : 50 € de coût IA par mois, soit 2 500 crédits au barème × 5', () => {
    // Il ne doit jamais arrêter quelqu'un qui a payé ses crédits : 50 € de
    // coût IA, c'est 250 € de crédits consommés dans le mois.
    expect(DEFAULT_COST_MICRO_EUR_PER_MONTH).toBe(50 * MICRO_EUR_PER_EUR);
  });

  it('lit le plafond depuis l’environnement', () => {
    expect(readQuotaLimits({ IGINI_QUOTA_COST_EUR_PER_MONTH: '7.5' })).toEqual({ costMicroEurPerMonth: 7_500_000 });
  });

  it('accepte « illimite » pour le désactiver', () => {
    expect(readQuotaLimits({ IGINI_QUOTA_COST_EUR_PER_MONTH: 'ILLIMITE' })).toEqual({ costMicroEurPerMonth: null });
  });

  it('une valeur illisible ne désactive PAS le plafond', () => {
    // Une faute de frappe ne doit pas ouvrir les vannes en silence.
    for (const valeur of ['gratuit', '-3', ' ', 'true']) {
      expect(readQuotaLimits({ IGINI_QUOTA_COST_EUR_PER_MONTH: valeur }).costMicroEurPerMonth).toBe(
        DEFAULT_COST_MICRO_EUR_PER_MONTH,
      );
    }
  });

  it('ignore l’ancien plafond en nombre d’appels : les crédits l’ont remplacé', () => {
    const env = { IGINI_QUOTA_CALLS_PER_MONTH: '3' } as { IGINI_QUOTA_COST_EUR_PER_MONTH?: string };
    expect(readQuotaLimits(env)).toEqual({ costMicroEurPerMonth: DEFAULT_COST_MICRO_EUR_PER_MONTH });
  });
});

describe('checkQuota — le garde-fou anti-abus', () => {
  it('laisse passer sous le plafond, et dit ce qu’il reste', () => {
    const verdict = checkQuota({ costMicroEur: 1_000_000 }, plafond(2));
    expect(verdict).toEqual({ allowed: true, breach: null, reason: null, remaining: { costMicroEur: 1_000_000 } });
  });

  it('refuse quand le coût du mois atteint le plafond, et dit clairement de quoi il s’agit', () => {
    const verdict = checkQuota({ costMicroEur: 2_000_000 }, plafond(2));
    expect(verdict.allowed).toBe(false);
    expect(verdict.breach).toBe('cout');
    expect(verdict.reason).toContain('2,00 €');
    expect(verdict.reason).toContain('Garde-fou');
    // Ce n'est pas le solde : les crédits ne sont pas touchés.
    expect(verdict.reason).toContain('tes crédits ne sont pas touchés');
    expect(verdict.reason).toContain('contact@ignitux.com');
    expect(verdict.reason).toContain('mois prochain');
    expect(CODE_PLAFOND_SECURITE).toBe('plafond_securite');
  });

  it('laisse passer quand un coût est inconnu, et le dit (null = non applicable)', () => {
    const verdict = checkQuota({ costMicroEur: null }, plafond(2));
    expect(verdict.allowed).toBe(true);
    expect(verdict.remaining.costMicroEur).toBeNull();
  });

  it('sans plafond, ne refuse jamais', () => {
    expect(checkQuota({ costMicroEur: 99_000_000 }, plafond(null))).toMatchObject({
      allowed: true,
      remaining: { costMicroEur: null },
    });
  });

  it('un plafond à zéro refuse dès le premier appel', () => {
    expect(checkQuota({ costMicroEur: 0 }, plafond(0)).allowed).toBe(false);
  });
});

describe('shouldWarn', () => {
  it('prévient au dernier cinquième du plafond par défaut', () => {
    expect(shouldWarn(checkQuota({ costMicroEur: 41_000_000 }, plafond(50)))).toBe(true);
    expect(shouldWarn(checkQuota({ costMicroEur: 1_000_000 }, plafond(50)))).toBe(false);
  });

  it('ne prévient plus une fois le mur atteint, ni sans plafond', () => {
    expect(shouldWarn(checkQuota({ costMicroEur: 50_000_000 }, plafond(50)))).toBe(false);
    expect(shouldWarn(checkQuota({ costMicroEur: null }, plafond(null)))).toBe(false);
  });
});
