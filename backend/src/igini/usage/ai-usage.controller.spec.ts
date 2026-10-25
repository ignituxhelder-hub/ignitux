import type { QuotaLimits, QuotaVerdict } from './ai-quota.js';
import { presenterQuota } from './ai-usage.controller.js';

const AUTORISE: QuotaVerdict = {
  allowed: true,
  breach: null,
  reason: null,
  remaining: { calls: null, costMicroEur: 1_000_000 },
};
const SANS_PLAFOND_D_APPELS: QuotaLimits = { callsPerMonth: null, costMicroEurPerMonth: 5_000_000 };

/**
 * « 38 utilisées, 16 restantes, sur 35 incluses » : trouvé sur l'écran de
 * Helder le 2026-10-18. Les 38 comptaient aussi les tours de chat et les
 * questions d'IGINI, hors forfait ; les 16 restantes, non.
 */
describe('le quota présenté à l’écran', () => {
  it('compte les analyses utilisées sur le même axe que celles qui restent', () => {
    const quota = presenterQuota(
      AUTORISE,
      SANS_PLAFOND_D_APPELS,
      { inclusesParLOffre: 35, dejaUtilisees: 19, offreId: 'entrepreneur' },
      38,
    );

    expect(quota.restant.analyses).toBe(16);
    expect(quota.utilisees.analyses).toBe(19);
    expect(quota.utilisees.analyses + (quota.restant.analyses ?? 0)).toBe(
      quota.plafonds.analyses_par_mois,
    );
  });

  it('compte tous les appels quand c’est le budget Ignitux qui arrête', () => {
    // Le garde-fou technique compte chaque appel, chat compris (voir
    // checkQuota) : c'est alors ce compteur-là qu'il faut montrer.
    const quota = presenterQuota(
      { ...AUTORISE, remaining: { calls: 2, costMicroEur: 1_000_000 } },
      { callsPerMonth: 40, costMicroEurPerMonth: 5_000_000 },
      { inclusesParLOffre: 35, dejaUtilisees: 19, offreId: 'entrepreneur' },
      38,
    );

    expect(quota.plafonds.analyses_selon).toBe('budget Ignitux');
    expect(quota.utilisees.analyses).toBe(38);
  });
});
