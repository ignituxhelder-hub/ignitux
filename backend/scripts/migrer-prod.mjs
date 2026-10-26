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
 * 4. **Ce que Prisma supprime sans rien demander.** Le point 3 ne suffit pas :
 *    Prisma ne réclame `--accept-data-loss` que si la table ou la colonne à
 *    supprimer contient des lignes. **Vide, elle disparaît sans un mot.** Le
 *    14/10/2026, deux migrations lancées depuis le mauvais dossier (une
 *    branche, puis un `main` local en retard de 23 commits) ont ainsi supprimé
 *    `project_collaborators.role` et les tables `space_*`. Le script vérifie
 *    donc, avant d'écrire quoi que ce soit, que ce dossier contient tout
 *    `origin/main` et un schéma committé, puis calcule ce que Prisma ferait
 *    (`prisma migrate diff`, en lecture seule) et refuse dès qu'il y a une
 *    suppression ou un changement de type.
 *
 * ── Avant de lancer ──────────────────────────────────────────────────────
 *
 *   node scripts/verifier-base.mjs .env.production   (lecture seule)
 *   node scripts/sauvegarde.mjs .env.production
 *
 * Le premier doit répondre ADDITIF. Sinon, s'arrêter et lire ce qu'il nomme.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Le dossier `backend` : git et Prisma y tournent quel que soit l'endroit
// d'où le script est lancé.
const BACKEND = fileURLToPath(new URL('..', import.meta.url));

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

/**
 * Le schéma envoyé est celui de CE dossier. S'il n'a pas tout `origin/main`,
 * il ignore ce que `main` a ajouté — et `db push` l'effacerait de la base.
 */
function verifierDossier() {
  const git = (...args) =>
    execFileSync('git', args, { cwd: BACKEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('fetch', '--quiet', 'origin', 'main');
  } catch {
    return ['Impossible de joindre GitHub (git fetch) : rien ne permet de vérifier que ce dossier a tout main.'];
  }
  try {
    const problemes = [];
    const retard = Number(git('rev-list', '--count', 'HEAD..origin/main'));
    if (retard > 0) {
      problemes.push(
        `Ce dossier a ${retard} commit(s) de retard sur origin/main : son schéma ignore ce que main a ajouté, ` +
          'et db push l’effacerait. Se placer sur main à jour (ou y fusionner main) avant de migrer.',
      );
    }
    if (git('status', '--porcelain', '--', 'prisma/schema.prisma') !== '') {
      problemes.push(
        'prisma/schema.prisma a des modifications non committées : la base recevrait un schéma qui n’est dans aucun commit.',
      );
    }
    return problemes;
  } catch (erreur) {
    return [`Vérification git impossible : ${erreur.message.split('\n')[0]}`];
  }
}

// Ce qui détruit ou peut détruire des données. `DROP NOT NULL` et
// `DROP DEFAULT` n'en font pas partie : ils relâchent une contrainte.
const DESTRUCTIF = /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|TYPE|VIEW|SCHEMA|EXTENSION)\b|\bSET\s+DATA\s+TYPE\b/i;

/**
 * Ce que `db push` ferait, calculé sans rien écrire. Le script SQL passe par
 * un fichier : sur la sortie standard, il serait mêlé aux messages de dotenv
 * et de Prisma.
 */
function calculerDiff() {
  const sortie = join(tmpdir(), `ignitux-diff-${process.pid}.sql`);
  try {
    const resultat = spawnSync(
      `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output "${sortie}"`,
      { cwd: BACKEND, shell: true, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } },
    );
    if (resultat.status !== 0) {
      const message = `${resultat.stderr ?? ''}${resultat.stdout ?? ''}`.trim().split('\n').slice(-3).join(' ');
      return { erreur: message || `code ${resultat.status}` };
    }
    const sql = readFileSync(sortie, 'utf8')
      .split(/\r?\n/)
      .filter((ligne) => !ligne.trim().startsWith('--'))
      .join('\n');
    const instructions = sql
      .split(';')
      .map((i) => i.trim())
      .filter(Boolean);
    return { instructions, destructives: instructions.filter((i) => DESTRUCTIF.test(i)) };
  } finally {
    rmSync(sortie, { force: true });
  }
}

const problemes = verifierDossier();
const diff = calculerDiff();

console.log('Vérifications :');
if (problemes.length === 0) {
  console.log('  ✓ ce dossier contient tout origin/main, et son schéma est committé');
}
for (const probleme of problemes) console.log(`  ✗ ${probleme}`);
if (diff.erreur) {
  console.log(`  ✗ Impossible de calculer ce que Prisma ferait : ${diff.erreur}`);
} else if (diff.instructions.length === 0) {
  console.log('  ✓ la base correspond déjà au schéma : rien à migrer');
} else {
  const marque = diff.destructives.length > 0 ? '✗' : '✓';
  console.log(`  ${marque} Prisma exécuterait ${diff.instructions.length} instruction(s) :`);
  for (const instruction of diff.instructions.slice(0, 40)) {
    const premiere = instruction.split('\n')[0];
    console.log(`      ${DESTRUCTIF.test(instruction) ? 'SUPPRIME → ' : ''}${premiere}`);
  }
  if (diff.instructions.length > 40) console.log(`      … et ${diff.instructions.length - 40} autre(s)`);
}
console.log('');

if (diff.destructives?.length > 0) {
  console.error(
    'ARRÊT. Cette migration supprimerait ou transformerait des données (lignes « SUPPRIME » ci-dessus).\n' +
      'Prisma le ferait sans rien demander si c’est vide. Cause habituelle : une autre branche a déjà\n' +
      'migré la production avec des tables que ce dossier ne connaît pas. Fusionner d’abord, ou en parler.',
  );
}
const bloque = problemes.length > 0 || Boolean(diff.erreur) || diff.destructives?.length > 0;

if (APPLIQUER && bloque) {
  console.error('Refus : rien n’a été écrit. Corriger les points ✗ ci-dessus, puis relancer.');
  process.exit(1);
}

if (APPLIQUER && diff.instructions.length === 0) {
  console.log('Rien à faire : la base est déjà à jour.');
  process.exit(0);
}

if (!APPLIQUER) {
  if (bloque) console.log('--appliquer sera refusé tant qu’un point ✗ reste.\n');
  console.log('Commande qui serait lancée :');
  console.log('  npx prisma db push          (sans --accept-data-loss, sans --force-reset)');
  console.log('\nAvant, si ce n’est pas déjà fait :');
  console.log(`  node scripts/verifier-base.mjs ${fichier}   → doit répondre ADDITIF`);
  console.log(`  node scripts/sauvegarde.mjs ${fichier}`);
  console.log('\nRelancer avec --appliquer pour migrer.');
  process.exit(bloque ? 1 : 0);
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
  cwd: BACKEND,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});

fils.on('exit', (code) => {
  console.log('');
  if (code === 0) {
    console.log('Migration passée. Vérifier MAINTENANT (une table neuve est le moment où un droit REST peut');
    console.log('réapparaître — credit_entries est le solde des comptes) :');
    console.log(`  npm run build && node scripts/verifier-base.mjs ${fichier}`);
    console.log('  → doit répondre « Surface REST : fermée ». Sinon :');
    console.log(`  node scripts/fermer-surface-rest.mjs ${fichier} --appliquer`);
  } else {
    console.log(`Prisma s’est arrêté (code ${code}). Rien n’a forcément été écrit —`);
    console.log('lire ce qu’il dit avant de recommencer, et ne pas ajouter de drapeau.');
  }
  process.exit(code ?? 1);
});
