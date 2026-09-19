import { CLAUDE_MODEL } from '../claude/claude.service.js';
import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  GRILLE,
  costMicroEur,
  microEurToEur,
  pricedModels,
  USD_TO_EUR_DENOMINATOR,
  USD_TO_EUR_NUMERATOR,
} from './ai-pricing.js';

describe('ai-pricing', () => {
  describe('tarification', () => {
    it("valorise un appel conformément à la grille, au micro-euro près", () => {
      // 1 200 × 5 $/M + 900 × 25 $/M = 0,0285 $, soit 0,02622 € à 0,92.
      expect(costMicroEur('claude-opus-5', { input_tokens: 1200, output_tokens: 900 })).toBe(26220);
      expect(costMicroEur('claude-sonnet-5', { input_tokens: 1200, output_tokens: 900 })).toBe(
        10488,
      );
      expect(costMicroEur('claude-haiku-4-5', { input_tokens: 1200, output_tokens: 900 })).toBe(
        5244,
      );
    });

    it('applique les multiplicateurs de cache au tarif d\'entrée', () => {
      const ecriture = costMicroEur('claude-opus-5', {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1000,
      });
      const lecture = costMicroEur('claude-opus-5', {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1000,
      });

      expect(ecriture).toBe(1000 * 5 * CACHE_WRITE_MULTIPLIER * 0.92);
      expect(lecture).toBe(1000 * 5 * CACHE_READ_MULTIPLIER * 0.92);
      // Une lecture de cache coûte bien moins qu'une écriture : si ces deux
      // colonnes étaient un jour inversées au moment de l'enregistrement, le
      // coût serait sous-estimé d'un facteur douze sans que rien ne le dise.
      expect(lecture).toBeLessThan(ecriture as number);
    });

    it("n'arrondit jamais un coût vers le bas", () => {
      // Un seul token d'entrée sur opus-5 vaut 4,6 micro-euros. L'arrondir à
      // 4 ferait de chaque appel une sous-estimation, toujours dans le même
      // sens — le genre de biais qui ne se compense pas avec le volume.
      expect(costMicroEur('claude-opus-5', { input_tokens: 1, output_tokens: 0 })).toBe(5);
    });

    it('ne dérive pas sur les grands volumes', () => {
      // Le calcul accumule un numérateur entier puis divise une seule fois.
      // Ce test compare à la référence arithmétique exacte sur un balayage :
      // la version précédente, qui enchaînait quatre multiplications
      // flottantes avant l'arrondi, divergeait d'un micro-euro sur 2,6 % des
      // tirages — assez peu pour ne jamais être remarqué, assez pour rendre
      // l'arrondi arbitraire.
      for (const [modele, taux] of Object.entries(GRILLE)) {
        for (let entree = 1; entree < 200000; entree += 7919) {
          for (let sortie = 1; sortie < 200000; sortie += 10007) {
            const attendu = Math.ceil(
              (entree * taux.input * USD_TO_EUR_NUMERATOR +
                sortie * taux.output * USD_TO_EUR_NUMERATOR) /
                USD_TO_EUR_DENOMINATOR,
            );
            expect(costMicroEur(modele, { input_tokens: entree, output_tokens: sortie })).toBe(
              attendu,
            );
          }
        }
      }
    });
  });

  describe('modèle inconnu', () => {
    it('renvoie null, et surtout pas zéro', () => {
      // Zéro se confondrait avec « gratuit » et disparaîtrait silencieusement
      // d'un total. null oblige l'appelant à dire ce qu'il en fait.
      expect(costMicroEur('claude-modele-inexistant', { input_tokens: 1000, output_tokens: 1000 }))
        .toBeNull();
    });
  });

  describe('garde-fou : la grille suit le modèle réellement appelé', () => {
    it('sait tarifer le modèle que le produit utilise', () => {
      // Le seul test de ce fichier qui protège contre une erreur future
      // plutôt que contre une erreur passée. Changer CLAUDE_MODEL sans
      // toucher à la grille ne casserait rien visiblement : les appels
      // passeraient, le journal se remplirait, et tous les coûts vaudraient
      // null. On s'en apercevrait en consultant les totaux, c'est-à-dire
      // précisément au moment où on en aurait besoin.
      expect(pricedModels()).toContain(CLAUDE_MODEL);
      expect(costMicroEur(CLAUDE_MODEL, { input_tokens: 100, output_tokens: 100 })).not.toBeNull();
    });
  });

  describe('conversion', () => {
    it('ramène les micro-euros en euros', () => {
      expect(microEurToEur(26220)).toBeCloseTo(0.02622, 10);
      expect(microEurToEur(1_000_000)).toBe(1);
    });
  });
});
