/**
 * LE BARÈME DES CRÉDITS, RECALCULÉ À PARTIR DES APPELS RÉELS.
 *
 * Lecture seule, du début à la fin : la session est ouverte en lecture seule
 * (`default_transaction_read_only`), et le script ne fait que des SELECT.
 *
 *   node scripts/bareme-credits.mjs                          # .env, 30 derniers jours
 *   node scripts/bareme-credits.mjs --env .env.production
 *   node scripts/bareme-credits.mjs --env .env.production --jours 60
 *
 * Il lit `ai_usage_events` sur la période, valorise chaque appel avec la
 * grille de `ai-pricing.ts`, prend le coût moyen par générateur, en tire le
 * prix par la règle du barème (coût × 5, en crédits de 0,10 €, arrondi au
 * supérieur, minimum 1) et affiche l'écart avec `src/credits/bareme.ts`.
 * Il ne modifie rien : changer un prix, c'est changer `coutReferenceMicroEur`
 * (et sa source) dans `bareme.ts`, puis déployer.
 *
 * Le chat se paie au message : son coût moyen est divisé par le nombre de
 * messages envoyés sur la période (`chat_messages`, rôle `user`), pas par le
 * nombre de tours journalisés.
 *
 * Jusqu'au 2026-10-25, les statuts se journalisaient sous « former » et la
 * conformité sous « executer ». Les appels « former »/« executer » d'avant le
 * premier « statuts »/« conformite » journalisé sont écartés (et comptés dans
 * les remarques) : ils mêleraient deux prix.
 *
 * Exige un build à jour (`npm run build`) : la grille et la règle sont lues
 * dans `dist/`, comme `verifier-base.mjs` lit le client Prisma compilé — une
 * seule source pour le serveur et pour ce calcul.
 *
 * N'affiche jamais la chaîne de connexion, seulement l'hôte et la base.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

// Même convention que verifier-base.mjs et sauvegarde.mjs : le fichier
// d'environnement nommé avec ou sans `--env`.
const drapeauEnv = process.argv.indexOf('--env');
const drapeauJours = process.argv.indexOf('--jours');
const valeursDeDrapeau = new Set(
  [drapeauEnv, drapeauJours].filter((i) => i >= 0).map((i) => i + 1),
);
const fichier =
  drapeauEnv >= 0 && process.argv[drapeauEnv + 1]
    ? process.argv[drapeauEnv + 1]
    : (process.argv.slice(2).find((a, i) => !a.startsWith('--') && !valeursDeDrapeau.has(i + 2)) ?? '.env');
const jours = drapeauJours >= 0 ? Number(process.argv[drapeauJours + 1]) : 30;
if (!Number.isInteger(jours) || jours < 1 || jours > 3650) {
  console.error('--jours attend un nombre entier de jours (1 à 3650).');
  process.exit(1);
}

function lireUrl(chemin) {
  const texte = readFileSync(chemin, 'utf8');
  const trouve = texte.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!trouve) throw new Error(`DATABASE_URL absente de ${chemin}`);
  return trouve[1];
}

async function compile(chemin) {
  return import(new URL(`../dist/${chemin}`, import.meta.url).href).catch(() => {
    throw new Error(`dist/${chemin} introuvable. Lancer d'abord :\n  npm run build`);
  });
}

const { costMicroEur } = await compile('igini/usage/ai-pricing.js');
const { proposerBareme } = await compile('credits/bareme-propose.js');

const url = lireUrl(fichier);
const adresse = new URL(url);

console.log('┌─ Barème des crédits, d’après les appels réels ────────────');
console.log('│ fichier :', fichier);
console.log('│ hôte    :', adresse.hostname);
console.log('│ base    :', adresse.pathname.slice(1));
console.log('│ période :', `${jours} derniers jours`);
console.log('└───────────────────────────────────────────────────────────');

const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
try {
  await client.connect();
} catch (erreur) {
  console.log('');
  console.log('CONNEXION IMPOSSIBLE :', erreur.code ?? erreur.message);
  process.exit(1);
}

try {
  await client.query('SET default_transaction_read_only = on');

  const { rows: evenements } = await client.query(
    `SELECT generator, model, input_tokens, output_tokens, cache_creation_input_tokens,
            cache_read_input_tokens, web_search_requests, created_at
       FROM ai_usage_events
      WHERE created_at >= now() - make_interval(days => $1::int)`,
    [jours],
  );
  const { rows: messages } = await client.query(
    `SELECT count(*)::int AS n FROM chat_messages
      WHERE role = 'user' AND created_at >= now() - make_interval(days => $1::int)`,
    [jours],
  );

  // Depuis quand « statuts » et « conformite » ont leur nom : sur tout
  // l'historique, pas seulement la période.
  const { rows: premiers } = await client.query(
    `SELECT generator, min(created_at) AS premier FROM ai_usage_events
      WHERE generator IN ('statuts', 'conformite') GROUP BY generator`,
  );
  const premier = (nom) => premiers.find((p) => p.generator === nom)?.premier ?? null;
  const separations = { former: premier('statuts'), executer: premier('conformite') };

  const appels = evenements.map((e) => ({
    generator: e.generator,
    quand: e.created_at,
    coutMicroEur: costMicroEur(e.model, {
      input_tokens: e.input_tokens,
      output_tokens: e.output_tokens,
      cache_creation_input_tokens: e.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: e.cache_read_input_tokens ?? 0,
      web_search_requests: e.web_search_requests ?? 0,
    }),
  }));
  const lignes = proposerBareme(appels, { messagesChat: messages[0].n, separations });

  const euros = (micro) => (micro === null ? '—' : `${(micro / 1_000_000).toFixed(4).replace('.', ',')} €`);
  const signe = (n) => (n === null ? '—' : n > 0 ? `+${n}` : String(n));

  console.log('');
  console.log(`${evenements.length} appel(s) journalisé(s), ${messages[0].n} message(s) de chat.`);
  console.log('');
  console.table(
    lignes.map((l) => ({
      générateur: l.generateur,
      appels: l.appels,
      'coût moyen': euros(l.coutMoyenMicroEur),
      'crédits proposés': l.creditsProposes ?? '—',
      'barème actuel': l.actuel ? l.actuel.credits : '—',
      'coût de référence': l.actuel ? euros(l.actuel.coutReferenceMicroEur) : '—',
      écart: signe(l.ecartCredits),
    })),
  );

  const remarques = lignes.filter((l) => l.remarque);
  if (remarques.length > 0) {
    console.log('Remarques :');
    for (const l of remarques) console.log(`  ${l.generateur} — ${l.remarque}`);
  }

  const aChanger = lignes.filter((l) => l.ecartCredits !== null && l.ecartCredits !== 0);
  console.log('');
  if (aChanger.length === 0) {
    console.log('Aucun écart : le barème en code correspond aux coûts mesurés.');
  } else {
    console.log('Pour suivre les mesures, dans src/credits/bareme.ts :');
    for (const l of aChanger) {
      console.log(
        `  ${l.generateur} : coutReferenceMicroEur ${l.actuel.coutReferenceMicroEur} → ${l.coutMoyenMicroEur}, ` +
          `credits ${l.actuel.credits} → ${l.creditsProposes} (et la source : mesuré sur ${l.unites} ` +
          `${l.generateur === 'discuter' ? 'message(s)' : 'appel(s)'}, ${jours} jours)`,
      );
    }
  }
} finally {
  await client.end();
}
