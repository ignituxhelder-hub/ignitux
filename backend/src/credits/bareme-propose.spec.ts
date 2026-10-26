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

  describe('les noms partagés avant le 2026-10-25', () => {
    // Jusqu'aux crédits, les statuts se journalisaient sous « former » et la
    // conformité sous « executer » : une moyenne qui les mêle surestime
    // « former » et « executer » (un document de statuts coûte bien plus
    // qu'une recommandation de forme).
    const SEPARATION = new Date('2026-10-26T09:00:00Z');
    const avant = new Date('2026-10-20T10:00:00Z');
    const apres = new Date('2026-10-27T10:00:00Z');
    const mesure = (generator: string, coutMicroEur: number, quand: Date): AppelMesure => ({
      generator,
      coutMicroEur,
      quand,
    });

    it('écarte les appels « former » d’avant le premier « statuts », et le dit', () => {
      const lignes = proposerBareme(
        [
          mesure('former', 500_000, avant), // en réalité des statuts
          ...Array.from({ length: 5 }, () => mesure('former', 80_000, apres)),
        ],
        { separations: { former: SEPARATION, executer: SEPARATION } },
      );
      const former = lignes.find((l) => l.generateur === 'former');

      expect(former).toMatchObject({ appels: 5, coutMoyenMicroEur: 80_000, ecartesAvantSeparation: 1 });
      expect(former?.remarque).toContain('1 appel(s) d’avant la séparation écarté(s)');
      expect(former?.remarque).toContain('statuts');
    });

    it('écarte de même les « executer » d’avant le premier « conformite »', () => {
      const executer = proposerBareme([mesure('executer', 300_000, avant), mesure('executer', 60_000, apres)], {
        separations: { former: SEPARATION, executer: SEPARATION },
      }).find((l) => l.generateur === 'executer');

      expect(executer).toMatchObject({ appels: 1, coutMoyenMicroEur: 60_000, ecartesAvantSeparation: 1 });
      expect(executer?.remarque).toContain('conformit');
    });

    it('sans aucun appel sous le nouveau nom, tout est écarté : impossible de séparer', () => {
      const former = proposerBareme([mesure('former', 80_000, apres)], { separations: { former: null } }).find(
        (l) => l.generateur === 'former',
      );

      expect(former).toMatchObject({ appels: 0, creditsProposes: null, ecartesAvantSeparation: 1 });
      expect(former?.remarque).toContain('aucun appel « statuts » encore journalisé');
    });

    it('ne touche pas aux autres générateurs', () => {
      const analyser = proposerBareme([mesure('analyser', 80_000, avant)], { separations: {} }).find(
        (l) => l.generateur === 'analyser',
      );

      expect(analyser).toMatchObject({ appels: 1, ecartesAvantSeparation: 0 });
    });
  });

  it('signale un générateur journalisé qui n’a pas de prix', () => {
    const inconnu = proposerBareme(appels('inventer', 50_000)).find((l) => l.generateur === 'inventer');
    expect(inconnu).toMatchObject({ actuel: null, ecartCredits: null, creditsProposes: 3 });
    expect(inconnu?.remarque).toContain('absent du barème');
  });
});
