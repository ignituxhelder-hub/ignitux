import { MANDATS_SUSPENDUS } from './mandats-suspension.js';

/**
 * Lever la suspension doit être un geste délibéré, pas un effet de bord :
 * il faut changer la constante ET ce test, après l'avis de l'avocat.
 */
describe('MANDATS_SUSPENDUS', () => {
  it('est levé seulement après un avis juridique écrit — suspendu pour l’instant', () => {
    expect(MANDATS_SUSPENDUS).toBe(true);
  });
});
