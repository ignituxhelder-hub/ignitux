import { GENERATOR_NAMES } from '../igini/usage/generator-names.js';
import { BAREME } from './bareme.js';
import { proposerBareme, type AppelMesure } from './bareme-propose.js';

const appels = (generator: string, ...couts: Array<number | null>): AppelMesure[] =>
  couts.map((coutMicroEur) => ({ generator, coutMicroEur }));

describe('proposerBareme — le barème que les appels réels justifieraient', () => {
  it('rend une ligne par générateur du barème, même sans appel', () => {
    const lignes = proposerBareme([]);
    expect(lignes.map((l) => l.generateur)).toEqual([...GENERATOR_NAMES]);
    expect(lignes.every((l) => l.creditsProposes === null && l.remarque?.includes('aucun appel'))).toBe(true);
  });

  it('tire le prix du coût moyen par la règle, et donne l’écart avec la table', () => {
    // Moyenne 0,12 € → 6 crédits.
    const [analyser] = proposerBareme(appels('analyser', 100_000, 140_000, 120_000, 110_000, 130_000));
    expect(analyser).toMatchObject({
      generateur: 'analyser',
      appels: 5,
      coutMoyenMicroEur: 120_000,
      creditsProposes: 6,
      actuel: { credits: BAREME.analyser.credits, coutReferenceMicroEur: BAREME.analyser.coutReferenceMicroEur },
      ecartCredits: 6 - BAREME.analyser.credits,
      remarque: null,
    });
  });

  it('prévient quand l’échantillon est trop petit, et ignore les modèles hors grille', () => {
    const construire = proposerBareme(appels('construire', 91_400, null)).find((l) => l.generateur === 'construire');
    expect(construire).toMatchObject({ appels: 1, nonTarifes: 1, creditsProposes: 5 });
    expect(construire?.remarque).toContain('seulement 1 appel');
    expect(construire?.remarque).toContain('hors grille');
  });

  it('compte le chat au message quand on connaît le nombre de messages', () => {
    // Trois tours pour deux messages : 30 000 µ€ en tout → 15 000 par message.
    const parMessage = proposerBareme(appels('discuter', 10_000, 10_000, 10_000), { messagesChat: 2 }).find(
      (l) => l.generateur === 'discuter',
    );
    expect(parMessage).toMatchObject({ unites: 2, coutMoyenMicroEur: 15_000, creditsProposes: 1 });
    expect(parMessage?.remarque).toContain('par message');

    const parTour = proposerBareme(appels('discuter', 10_000, 10_000, 10_000)).find((l) => l.generateur === 'discuter');
    expect(parTour?.unites).toBe(3);
    expect(parTour?.remarque).toContain('sous-estimé');
  });

  it('signale un générateur journalisé qui n’a pas de prix', () => {
    const inconnu = proposerBareme(appels('inventer', 50_000)).find((l) => l.generateur === 'inventer');
    expect(inconnu).toMatchObject({ actuel: null, ecartCredits: null, creditsProposes: 3 });
    expect(inconnu?.remarque).toContain('absent du barème');
  });
});
