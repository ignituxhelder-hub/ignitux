/**
 * VÉRIFIER UNE BASE AVANT DE LA MIGRER.
 *
 * Lecture seule, du début à la fin. N'écrit rien, ne crée rien, ne modifie
 * rien — il se contente de répondre à la seule question qui compte avant un
 * `prisma db push` : **qu'est-ce qui manque, et est-ce que le combler peut
 * détruire quelque chose ?**
 *
 *   node scripts/verifier-base.mjs               # utilise .env
 *   node scripts/verifier-base.mjs .env.test
 *   node scripts/verifier-base.mjs .env.production
 *
 * ── Ce qu'il refuse de faire ──────────────────────────────────────────────
 *
 * Il n'affiche jamais la chaîne de connexion, seulement l'hôte et le nom de
 * la base : un rapport de vérification finit collé dans une conversation.
 *
 * ── Comment lire sa sortie ────────────────────────────────────────────────
 *
 * « ADDITIF » veut dire que `prisma db push` n'émettra que des CREATE TABLE
 * et des ADD COLUMN. C'est le cas sûr.
 *
 * « À EXAMINER » veut dire qu'une colonne attendue est absente ET que la
 * table contient déjà des lignes — donc que l'ajout doit être nullable ou
 * pourvu d'un défaut, sinon Postgres refusera. Le script le dit ; il ne
 * décide pas à votre place.
 *
 * Si `prisma db push` réclame ensuite `--accept-data-loss`, c'est que ce
 * rapport est faux quelque part. Il faut alors s'arrêter et comprendre, pas
 * passer le drapeau.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const fichier = process.argv[2] ?? '.env';

function lireUrl(chemin) {
  const texte = readFileSync(chemin, 'utf8');
  const trouve = texte.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!trouve) throw new Error(`DATABASE_URL absente de ${chemin}`);
  return trouve[1];
}

/**
 * Les colonnes attendues par table, dérivées du client Prisma **compilé**.
 *
 * Lu depuis `dist/` et non `src/` : le client généré est du TypeScript, que
 * Node ne sait pas importer tel quel. Le script exige donc un build à jour,
 * et le dit plutôt que d'échouer sur une trace incompréhensible.
 */
async function attendu() {
  const chemin = new URL('../dist/generated/prisma/client.js', import.meta.url);
  const prisma = await import(chemin.href).catch(() => {
    throw new Error(
      "Client Prisma compilé introuvable. Lancer d'abord :\n" +
        '  npx prisma generate && npm run build',
    );
  });
  const Prisma = prisma.Prisma;
  const parTable = new Map();
  for (const [cle, valeur] of Object.entries(Prisma)) {
    if (!cle.endsWith('ScalarFieldEnum') || typeof valeur !== 'object' || !valeur) continue;
    const modele = cle.slice(0, -'ScalarFieldEnum'.length);
    parTable.set(modele.charAt(0).toLowerCase() + modele.slice(1), Object.values(valeur));
  }
  return parTable;
}

const url = lireUrl(fichier);
const adresse = new URL(url);
const tables = await attendu();

console.log('┌─ Vérification de base ────────────────────────────────────');
console.log('│ fichier :', fichier);
console.log('│ hôte    :', adresse.hostname);
console.log('│ base    :', adresse.pathname.slice(1));
console.log('│ attendu :', tables.size, 'tables');
console.log('└───────────────────────────────────────────────────────────');

const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });

try {
  await client.connect();
} catch (erreur) {
  console.log('');
  console.log('CONNEXION IMPOSSIBLE :', erreur.code ?? erreur.message);
  if (erreur.code === 'ENOTFOUND') {
    console.log("L'hôte ne résout pas. Vérifier l'état du projet chez l'hébergeur,");
    console.log('et copier la chaîne de connexion telle que le tableau de bord');
    console.log("l'affiche — hôte, port ET nom d'utilisateur peuvent avoir changé.");
  }
  process.exit(1);
}

try {
  const { rows: versions } = await client.query('SELECT version()');
  console.log('');
  console.log('Connexion établie :', versions[0].version.split(',')[0]);

  const { rows: enBase } = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const presentes = new Map();
  for (const ligne of enBase) {
    const colonnes = presentes.get(ligne.table_name) ?? new Set();
    colonnes.add(ligne.column_name);
    presentes.set(ligne.table_name, colonnes);
  }

  const tablesManquantes = [];
  const colonnesManquantes = [];
  for (const [table, colonnes] of tables) {
    const surPlace = presentes.get(table);
    if (!surPlace) {
      tablesManquantes.push(table);
      continue;
    }
    for (const colonne of colonnes) {
      if (!surPlace.has(colonne)) colonnesManquantes.push({ table, colonne });
    }
  }

  // Une table du schéma qui n'existe plus côté code : le signe qu'une
  // suppression a eu lieu quelque part, et le seul cas où `db push`
  // proposerait de détruire.
  const enTrop = [...presentes.keys()].filter(
    (t) => !tables.has(t) && !t.startsWith('_') && t !== 'spatial_ref_sys',
  );

  console.log('');
  console.log('Tables    :', presentes.size, 'présentes /', tables.size, 'attendues');
  console.log(
    '  manquantes :',
    tablesManquantes.length ? tablesManquantes.join(', ') : 'aucune',
  );
  console.log(
    '  en trop    :',
    enTrop.length ? `${enTrop.join(', ')}  ← À EXAMINER` : 'aucune',
  );

  console.log('');
  if (colonnesManquantes.length === 0) {
    console.log('Colonnes  : aucune manquante');
  } else {
    console.log('Colonnes manquantes :');
    for (const { table, colonne } of colonnesManquantes) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
      const lignes = rows[0].n;
      const verdict = lignes === 0 ? 'ADDITIF (table vide)' : `À EXAMINER (${lignes} ligne(s))`;
      console.log(`  ${table}.${colonne} — ${verdict}`);
    }
  }

  // Quelques comptes utiles pour savoir ce qu'on risque.
  console.log('');
  for (const table of ['users', 'projects', 'compliance_requirements']) {
    if (!presentes.has(table)) continue;
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
    console.log(`  ${table} : ${rows[0].n} ligne(s)`);
  }

  console.log('');
  const sur = enTrop.length === 0 && colonnesManquantes.length === 0;
  const additif = enTrop.length === 0;
  if (sur) {
    console.log('VERDICT : la base est à jour. Rien à migrer.');
  } else if (additif) {
    console.log('VERDICT : ADDITIF. `prisma db push` ne fera que créer.');
    console.log('          Sauvegarder quand même avant : node scripts/sauvegarde.mjs');
  } else {
    console.log('VERDICT : À EXAMINER. Des tables existent en base sans exister au');
    console.log('          schéma. `prisma db push` proposerait de les détruire.');
    console.log('          NE PAS passer --accept-data-loss avant de comprendre.');
  }
} finally {
  await client.end();
}
