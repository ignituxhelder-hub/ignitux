import { betaV1Actif } from './beta-v1';

describe('périmètre de la bêta V1 (frontend)', () => {
  it('est actif quand la variable est absente', () => {
    expect(betaV1Actif(undefined)).toBe(true);
  });

  it("est actif sur 'true'", () => {
    expect(betaV1Actif('true')).toBe(true);
  });

  it("est désactivé seulement sur 'false'", () => {
    expect(betaV1Actif('false')).toBe(false);
  });

  it('reste actif sur une valeur mal orthographiée', () => {
    for (const typo of ['False', 'FALSE', 'non', '0', '', ' false ']) {
      expect(betaV1Actif(typo)).toBe(true);
    }
  });
});
