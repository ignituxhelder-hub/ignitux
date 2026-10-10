import {
  EvaluationReportSchema,
  normaliserRapport,
  statutLu,
  VERDICT_LABEL,
} from './evaluation-model.js';
import { rapport } from './evaluation.fixture.js';

const risque = (i: number) => ({ risque: `r${i}`, gravite: 'faible' as const, reduction: 'x' });
const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);

describe('modèle de l’évaluation de financement', () => {
  it('nomme les trois verdicts comme la spec', () => {
    expect(VERDICT_LABEL).toEqual({
      financable: 'Finançable en l’état',
      financable_apres_corrections: 'Finançable après corrections',
      pas_financable_en_l_etat: 'Pas finançable en l’état',
    });
  });

  it('refuse un verdict hors des trois valeurs', () => {
    expect(EvaluationReportSchema.safeParse(rapport({ verdict: 'peut-etre' as never })).success).toBe(false);
    expect(EvaluationReportSchema.safeParse(rapport()).success).toBe(true);
  });

  it('tronque à 6 risques et 5 étapes, garde moins sans compléter', () => {
    const neuf = Array.from({ length: 9 }, (_, i) => risque(i));
    const r = normaliserRapport(rapport({ risques: neuf, prochainesEtapes: ['a'] }));
    expect(r.risques).toHaveLength(6);
    expect(r.risques[0].risque).toBe('r0');
    expect(r.prochainesEtapes).toEqual(['a']);

    const sept = normaliserRapport(rapport({ prochainesEtapes: ['1', '2', '3', '4', '5', '6', '7'] }));
    expect(sept.prochainesEtapes).toEqual(['1', '2', '3', '4', '5']);
  });

  it('lit en échec une préparation de plus de 10 minutes', () => {
    const t0 = new Date('2026-10-11T10:00:00Z');
    expect(statutLu('en_preparation', t0, minutes(t0, 11))).toBe('echec');
    expect(statutLu('en_preparation', t0, minutes(t0, 9))).toBe('en_preparation');
    expect(statutLu('en_revue', t0, minutes(t0, 600))).toBe('en_revue');
  });
});
