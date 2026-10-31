import { estGenerateur, GENERATOR_NAMES } from './generator-names.js';

describe('generator-names', () => {
  it('reconnaît discuter comme un générateur valide (le chat libre avec IGINI)', () => {
    expect(estGenerateur('discuter')).toBe(true);
    expect(GENERATOR_NAMES).toContain('discuter');
  });

  it('nomme les statuts et la conformité à part, pour leur donner leur propre prix', () => {
    expect(estGenerateur('statuts')).toBe(true);
    expect(estGenerateur('conformite')).toBe(true);
  });

  it('rejette une chaîne qui ne correspond à aucun générateur', () => {
    expect(estGenerateur('inventer')).toBe(false);
  });

  it('ne contient aucun doublon', () => {
    expect(new Set(GENERATOR_NAMES).size).toBe(GENERATOR_NAMES.length);
  });
});
