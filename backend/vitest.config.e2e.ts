import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Charge `.env.test` et refuse de démarrer si la base visée n'est pas
    // celle des tests — voir test/setup-e2e.ts.
    setupFiles: ['./test/setup-e2e.ts'],
    // Ces tests partagent une vraie base : les faire tourner en parallèle
    // ferait interférer leurs données entre elles. Le coût en durée est
    // réel, la fiabilité qu'on y gagne l'est aussi.
    fileParallelism: false,
    // Une requête réseau vers Supabase est plus lente qu'un mock.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
