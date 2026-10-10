import { promptEvaluation, SYSTEM_PROMPT_EVALUATION } from './evaluation-prompts.js';

describe('consigne de l’évaluation de financement', () => {
  it('dit de ne rien inventer et de nommer les manques', () => {
    expect(SYSTEM_PROMPT_EVALUATION).toMatch(/n'invente/i);
    expect(SYSTEM_PROMPT_EVALUATION).toMatch(/manque/i);
    expect(SYSTEM_PROMPT_EVALUATION).toMatch(/sans recommandation personnalisée/i);
  });

  it('produit un prompt valable pour un projet sans aucun contexte', () => {
    const p = promptEvaluation('Boulangerie', null, undefined);
    expect(p).toContain('Boulangerie');
    expect(p).toMatch(/aucune donnée/i);
  });

  it('transmet le contexte du projet quand il existe', () => {
    expect(promptEvaluation('B', 'desc', 'Analyse : marché porteur')).toContain('Analyse : marché porteur');
  });

  it('transmet la consigne de l’administrateur quand elle existe', () => {
    expect(promptEvaluation('B', null, 'ctx', 'reprends le marché')).toContain('reprends le marché');
    expect(promptEvaluation('B', null, 'ctx')).not.toMatch(/consigne/i);
  });
});
