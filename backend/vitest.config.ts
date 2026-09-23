import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    /**
     * Dix secondes, et non les cinq par défaut.
     *
     * Cinquante fichiers de tests construisent un module Nest avec
     * `Test.createTestingModule`, et cette compilation coûte quelques
     * secondes la première fois — davantage quand plusieurs fichiers
     * s'exécutent en parallèle sur une machine chargée. Observé ici :
     * « ReadinessService › rend "ok" quand tout répond » a mis 5 232 ms et a
     * donc échoué, alors que tout y est simulé et que le même test passe
     * seul en 400 ms. Trois exécutions suivantes l'ont vu passer.
     *
     * Un échec au hasard, une fois sur quatre, est pire qu'un test lent : il
     * apprend à relancer sans lire, et le jour où l'échec est réel on le
     * relance aussi. Ce délai ne masque rien du code testé — il laisse juste
     * à Nest le temps d'assembler ses graphes.
     */
    testTimeout: 10_000,
  },
});
