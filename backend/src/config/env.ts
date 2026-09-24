import { z } from 'zod';
import { productionProblems } from './production-preflight.js';

const envSchema = z.object({
  // 'production' déclenche les exigences de production-preflight.ts. Toute
  // autre valeur, absence comprise, laisse le mode développement.
  NODE_ENV: z.string().optional(),
  /**
   * Le nombre de proxys entre Internet et ce serveur, ou 'false'.
   *
   * Express ne peut pas le deviner, et les deux erreurs sont silencieuses :
   * ne rien déclarer derrière un proxy met tout le monde dans le même seau
   * de limitation ; tout déclarer sans proxy laisse un client forger son
   * en-tête `X-Forwarded-For` et se rendre invisible du limiteur.
   */
  TRUST_PROXY: z.string().optional(),
  /** 'smtp' | 'log'. Voir production-preflight.ts — 'log' doit être écrit. */
  MAIL_TRANSPORT: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** 'true' sert /docs en production. Éteint par défaut. */
  ENABLE_API_DOCS: z.string().optional(),
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
  // Interrupteur des 5 générateurs IGINI, les seules fonctionnalités qui
  // consomment du budget IA. `'false'` les éteint en amont de tout appel
  // réseau (voir igini/claude/generators-availability.ts). Non validée en
  // enum à dessein : une valeur inattendue laisse le produit complet plutôt
  // que d'empêcher le serveur de démarrer.
  IGINI_AI_ENABLED: z.string().optional(),
  // Plafonds de consommation IA, par personne et par mois civil. Tous deux
  // optionnels : leur absence retombe sur l'offre annoncée (5 analyses,
  // 2,00 € de coût IA — voir ai-quota.ts). `illimite` désactive un axe.
  //
  // Non validés en nombre à dessein, comme IGINI_AI_ENABLED : une valeur
  // illisible retombe sur le défaut plutôt que d'empêcher le serveur de
  // démarrer. La différence avec l'interrupteur est le sens du repli — là
  // une valeur inattendue laisse le produit complet, ici elle laisse le
  // plafond en place. Dans les deux cas l'inattendu penche du côté prudent.
  IGINI_QUOTA_CALLS_PER_MONTH: z.string().optional(),
  IGINI_QUOTA_COST_EUR_PER_MONTH: z.string().optional(),
  /**
   * L'identité légale d'Ignitux. Déclarées ici, et il a fallu une panne
   * pour comprendre pourquoi.
   *
   * `identite-ignitux.ts` les lit directement dans `process.env`, donc
   * elles fonctionnaient. Mais `production-preflight.ts`, lui, reçoit les
   * données **validées par zod** — et zod retire les clés qu'il ne connaît
   * pas. Le contrôle vérifiait donc trois réglages qui ne lui parvenaient
   * jamais, et refusait de démarrer en annonçant :
   *
   *     IGNITUX_RAISON_SOCIALE : est vide. Ignitux ne l'invente pas —
   *     renseigne-la.
   *
   * ...devant un fichier où elle est renseignée. La production ne pouvait
   * pas démarrer, avec une configuration correcte et un message qui
   * envoyait chercher au mauvais endroit.
   *
   * Optionnelles ici parce que le développement s'en passe : c'est le
   * contrôle de production qui exige les trois premières, et lui seul.
   */
  IGNITUX_RAISON_SOCIALE: z.string().optional(),
  IGNITUX_ADRESSE: z.string().optional(),
  IGNITUX_EMAIL: z.string().optional(),
  IGNITUX_IDENTIFIANT: z.string().optional(),
  IGNITUX_TVA: z.string().optional(),
  IGNITUX_IBAN: z.string().optional(),
  IGNITUX_BIC: z.string().optional(),
  /** 'aucun' tant qu'aucun encaissement n'est branché. Voir offres.service.ts. */
  PAIEMENT_FOURNISSEUR: z.string().optional(),
});

/**
 * Le schéma, exporté pour que le contrôle à blanc emprunte exactement le
 * même chemin que le démarrage.
 *
 * Sans cela, `scripts/verifier-production.mjs` appelait le contrôle avec
 * `process.env` brut, où rien n'est retiré — et annonçait « 1 bloquant »
 * quand le vrai démarrage en comptait quatre. Un contrôle à blanc plus
 * optimiste que la réalité est pire que pas de contrôle : il donne la
 * permission de déployer.
 */
export { envSchema };

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Oublie la configuration lue.
 *
 * Existe pour les tests, et l'assume : un cache de portée module survit
 * d'un test à l'autre, si bien qu'un test qui change une variable mesurerait
 * en réalité la configuration lue par le premier d'entre eux. L'alternative
 * — recharger le module — casse les jetons d'injection de Nest, puisque la
 * classe rechargée n'est plus celle que le conteneur connaît.
 *
 * Rien en production n'appelle cette fonction : l'environnement d'un
 * processus ne change pas sous ses pieds.
 */
export function forgetEnv(): void {
  cachedEnv = undefined;
}

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

  // Les exigences propres à la production ne portent pas sur la FORME des
  // variables — zod s'en charge — mais sur leur CONTENU : un secret resté à
  // sa valeur d'exemple est une chaîne parfaitement valide, et une faille.
  const problemes = productionProblems(result.data);
  if (problemes.length > 0) {
    const liste = problemes.map((p) => `  - ${p.setting} : ${p.detail}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(
      `Refus de démarrer en production — ${problemes.length} réglage(s) à corriger :\n${liste}\n\n` +
        'Ces fautes ne provoqueraient aucune erreur visible : le serveur démarrerait et\n' +
        'se comporterait mal en silence. Voir docs/mise-en-production.md.',
    );
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}
