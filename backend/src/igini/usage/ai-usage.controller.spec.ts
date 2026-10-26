import type { QuotaLimits, QuotaVerdict } from './ai-quota.js';
import { presenterQuota } from './ai-usage.controller.js';

const AUTORISE: QuotaVerdict = {
  allowed: true,
  breach: null,
  reason: null,
  remaining: { costMicroEur: 1_000_000 },
};
const LIMITES: QuotaLimits = { costMicroEurPerMonth: 5_000_000 };

/**
 * « 38 utilisées, 16 restantes, sur 35 incluses » : trouvé sur l'écran de
 * Helder le 2026-10-18. Les 38 comptaient aussi les tours de chat et les
 * questions d'IGINI, hors forfait ; les 16 restantes, non.
 *
 * Depuis les crédits IGINI (2026-10-25), il n'y a plus d'analyses incluses :
 * le serveur ne rend plus aucun compte d'analyses à mettre en regard d'un
 * total d'appels — ce qui reste se lit en crédits, dans `GET /credits`.
 */
describe('le quota présenté à l’écran', () => {
  it('ne rend aucun compte d’analyses restantes ni de plafond en nombre', () => {
    const quota = presenterQuota(AUTORISE, LIMITES);

    expect(quota.restant.analyses).toBeNull();
    expect(quota.plafonds.analyses_par_mois).toBeNull();
    expect(quota).not.toHaveProperty('utilisees');
  });

  it('prévient au dernier cinquième du plafond appliqué (ici 5 €), pas du défaut', () => {
    const loin = presenterQuota({ ...AUTORISE, remaining: { costMicroEur: 4_000_000 } }, LIMITES);
    const proche = presenterQuota({ ...AUTORISE, remaining: { costMicroEur: 900_000 } }, LIMITES);

    expect(loin.bientot_atteint).toBe(false);
    expect(proche.bientot_atteint).toBe(true);
  });

  it('garde ce qui reste avant le garde-fou de coût, en euros', () => {
    const quota = presenterQuota(AUTORISE, LIMITES);

    expect(quota.restant.euros).toBe(1);
    expect(quota.plafonds.euros_par_mois).toBe(5);
  });
});
