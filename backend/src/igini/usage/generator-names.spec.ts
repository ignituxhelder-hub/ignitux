import { estGenerateur, GENERATOR_NAMES } from './generator-names.js';

describe('generator-names', () => {
  it('reconnaît discuter comme un générateur valide (le chat libre avec Igini)', () => {
    expect(estGenerateur('discuter')).toBe(true);
    expect(GENERATOR_NAMES).toContain('discuter');
  });

  it('rejette une chaîne qui ne correspond à aucun générateur', () => {
    expect(estGenerateur('inventer')).toBe(false);
  });
});
