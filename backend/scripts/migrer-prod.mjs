/**
 * MIGRER LA BASE DE PRODUCTION — avec les garde-fous qui manquaient.
 *
 *   node scripts/migrer-prod.mjs                 (montre la cible, ne fait rien)
 *   node scripts/migrer-prod.mjs --appliquer
 *
 * ── Pourquoi ce script plutôt que `prisma db push` à la main ─────────────
 *
 * Trois raisons, dont deux sont des erreurs déjà commises sur ce projet.
 *
 * 1. **La cible.** `prisma db push` lit `DATABASE_URL` depuis `.env`, donc la
 *    base de *développement*. Pour viser la production il faut la remplacer,
 *    et c'est exactement là qu'on se trompe : `sauvegarde.mjs .env.production`
 *    a déjà sauvegardé la base de développement sans rien signaler. Ici la
 *    cible est lue dans `.env.production`, affichée avant d'agir, et le
 *    script **refuse** de tourner si elle s'appelle `postgres`.
 *
 * 2. **Le secret.** `prisma db push --url "postgresql://…"` écrirait la chaîne
 *    de connexion dans l'historique du shell, où elle resterait. Elle est
 *    passée par l'environnement du processus fils, qui meurt avec lui.
 *
 * 3. **Les deux drapeaux qu'on ne passe pas.** `--accept-data-loss` et
 *    `--force-reset` ne sont jamais transmis, et le script s'arrête si on
 *    essaie de les lui donner. Si Prisma réclame l'un des deux, c'est que la
 *    migration n'est plus additive — et ce n'est pas une case à cocher, c'est
 *    une conversation à avoir.
 *
 * ── Avant de lancer ──────────────────────────────────────────────────────
 *
 *   node scripts/verifier-base.mjs .env.production   (lecture seule)
 *   node scripts/sauvegarde.mjs .env.production
 *
 * Le premier doit répondre ADDITIF. Sinon, s'arrêter et lire ce qu'il nomme.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const INTERDITS = ['--accept-data-loss', '--force-reset'];
const passeInterdit = process.argv.find((a) => INTERDITS.includes(a));
if (passeInterdit) {
  console.error(
    `Refus : ce script ne transmet jamais ${passeInterdit}.\n` +
      "Si Prisma le réclame, la migration n'est plus additive — arrêter et en parler.",
  );
  process.exit(1);
}

const drapeauEnv = process.argv.indexOf('--env');
const fichier =
  drapeauEnv >= 0 && process.argv[drapeauEnv + 1]
    ? process.argv[drapeauEnv + 1]
    : (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.env.production');
const APPLIQUER = process.argv.includes('--appliquer');

let url;
try {
  const texte = readFileSync(fichier, 'utf8');
  const trouve = texte.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!trouve) throw new Error(`DATABASE_URL absente de ${fichier}`);
  url = trouve[1];
} catch (erreur) {
  console.error(erreur.message);
  process.exit(1);
}

const adresse = new URL(url);
const base = adresse.pathname.slice(1);

console.log('┌─ Migration ───────────────────────────────────────────────');
console.log(`│ fichier : ${fichier}`);
console.log(`│ hôte    : ${adresse.hostname}`);
console.log(`│ base    : ${base}`);
console.log(`│ mode    : ${APPLIQUER ? 'APPLIQUER' : 'aperçu (rien ne sera écrit)'}`);
console.log('└───────────────────────────────────────────────────────────\n');

// La base `postgres` est celle du développement. Si elle apparaît ici, c'est
// que le mauvais fichier a été nommé — et migrer la base de développement en
// croyant migrer la production est le genre d'erreur qu'on ne voit qu'après.
if (base === 'postgres') {
  console.error(
    'ARRÊT. La cible est la base « postgres », celle du développement.\n' +
      `Le fichier ${fichier} ne pointe pas sur la production.`,
  );
  process.exit(1);
}

if (!APPLIQUER) {
  console.log('Commande qui serait lancée :');
  console.log('  npx prisma db push          (sans --accept-data-loss, sans --force-reset)');
  console.log('\nAvant, si ce n’est pas déjà fait :');
  console.log(`  node scripts/verifier-base.mjs ${fichier}   → doit répondre ADDITIF`);
  console.log(`  node scripts/sauvegarde.mjs ${fichier}`);
  console.log('\nRelancer avec --appliquer pour migrer.');
  process.exit(0);
}

// `dotenv` ne remplace jamais une variable déjà posée : en la donnant ici, on
// est sûr que `prisma7.config.ts` verra celle-ci et non celle de `.env`.
// La commande part en une seule chaîne, et non en tableau d'arguments :
// avec `shell: true`, Node déprécie la seconde forme (DEP0190) parce que les
// arguments sont concaténés sans être échappés. Rien ici ne vient de
// l'extérieur, mais un avertissement qu'on laisse traîner finit par masquer
// celui qui comptera. `shell: true` reste nécessaire sous Windows, où `npx`
// est un `.cmd`.
const fils = spawn('npx prisma db push', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});

fils.on('exit', (code) => {
  console.log('');
  if (code === 0) {
    console.log('Migration passée. Vérifier :');
    console.log(`  node scripts/verifier-base.mjs ${fichier}`);
  } else {
    console.log(`Prisma s’est arrêté (code ${code}). Rien n’a forcément été écrit —`);
    console.log('lire ce qu’il dit avant de recommencer, et ne pas ajouter de drapeau.');
  }
  process.exit(code ?? 1);
});
