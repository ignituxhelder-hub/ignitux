import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis.'),
  // 32 caractères minimum : un secret plus court serait trivialement plus
  // facile à retrouver par force brute hors ligne sur des tokens signés HS256.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères.'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  FRONTEND_URL: z.string().default('http://localhost:3001'),
  PORT: z.string().default('3000'),
  // Optionnelle : le SDK Anthropic peut aussi résoudre les identifiants via
  // d'autres mécanismes (voir @anthropic-ai/sdk). Son absence ne doit pas
  // empêcher le démarrage du serveur, seulement les endpoints d'IA.
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Valide et met en cache les variables d'environnement requises. À appeler le
 * plus tôt possible (avant `NestFactory.create`) pour échouer immédiatement
 * avec un message clair plutôt que par une erreur obscure plus tard (ex. un
 * crash Prisma sans DATABASE_URL, ou un JwtStrategy qui plante au premier
 * login).
 */
export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Configuration invalide (voir backend/.env.example) :\n${issues}`);
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}
