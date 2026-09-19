import {
  GENERATORS_DISABLED_MESSAGE,
  readGeneratorsAvailability,
} from './generators-availability.js';

describe('disponibilité des générateurs IGINI', () => {
  it("éteint les générateurs sur 'false'", () => {
    const availability = readGeneratorsAvailability('false');

    expect(availability.enabled).toBe(false);
    expect(availability.reason).toBe(GENERATORS_DISABLED_MESSAGE);
  });

  it('les laisse actifs quand la variable est absente', () => {
    expect(readGeneratorsAvailability(undefined)).toEqual({ enabled: true, reason: null });
  });

  it("les laisse actifs sur 'true'", () => {
    expect(readGeneratorsAvailability('true')).toEqual({ enabled: true, reason: null });
  });

  it("ne coupe rien sur une valeur mal orthographiée", () => {
    // Décision assumée : une faute de frappe ne doit pas éteindre
    // silencieusement une fonctionnalité. Le sens par défaut d'Ignitux est
    // « le produit est complet » ; l'éteindre demande une valeur exacte.
    for (const typo of ['False', 'FALSE', 'non', '0', '', ' false ']) {
      expect(readGeneratorsAvailability(typo).enabled).toBe(true);
    }
  });

  it('nomme les cinq générateurs dans le message affiché', () => {
    // Le testeur doit comprendre ce qui est éteint sans avoir à deviner.
    for (const generator of ['Analyser', 'Construire', 'Financer', 'Développer', 'Transmettre']) {
      expect(GENERATORS_DISABLED_MESSAGE).toContain(generator);
    }
  });

  it("dit que c'est volontaire, pas cassé", () => {
    expect(GENERATORS_DISABLED_MESSAGE).toContain('non disponible');
    expect(GENERATORS_DISABLED_MESSAGE).toContain('volontairement');
  });
});
