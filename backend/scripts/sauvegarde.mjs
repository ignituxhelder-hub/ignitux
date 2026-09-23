#!/usr/bin/env node
/**
 * SAUVEGARDE LOGIQUE — un export de toutes les tables, en JSON.
 *
 * ## Ce que ce script est, et ce qu'il n'est pas
 *
 * Ce n'est **pas** le plan de reprise principal. Sur Supabase, la sauvegarde
 * de référence est celle de l'hébergeur : automatique, physique, restaurable
 * à un instant donné. Aucun script maison ne fait mieux, et prétendre le
 * contraire serait dangereux.
 *
 * Ce script répond à une question que la sauvegarde de l'hébergeur ne
 * couvre pas : **que se passe-t-il si le problème vient de l'hébergeur ?**
 * Compte suspendu, erreur de facturation, région indisponible, décision
 * commerciale. Une copie indépendante, lisible sans outil propriétaire, et
 * qu'on peut restaurer ailleurs, est la seule réponse à ce cas-là.
 *
 * Il ne remplace donc pas `pg_dump` : un export logique par le client ignore
 * les vues, les fonctions, les politiques RLS et les séquences. Il contient
 * les **données**, qui sont l'irremplaçable — le schéma, lui, se recrée à
 * partir du code par `prisma db push`.
 *
 * ## Usage
 *
 *   node scripts/sauvegarde.mjs                    → base de .env
 *   node scripts/sauvegarde.mjs --env .env.production
 *   node scripts/sauvegarde.mjs --sortie ./copies
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

function argument(nom, defaut) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

/**
 * Le fichier d'environnement, nomme avec ou sans `--env`.
 *
 * Son voisin `verifier-base.mjs` le prend en argument nu. Deux conventions
 * sur deux scripts qu'on enchaine toujours dans le meme souffle, et la
 * commande `sauvegarde.mjs .env.production` sauvegardait silencieusement la
 * base de developpement : le fichier nomme etait ignore, le defaut
 * s'appliquait, et la sortie ressemblait a une reussite. Une sauvegarde qui
 * vise la mauvaise base est pire que pas de sauvegarde, parce qu'on migre
 * ensuite en croyant etre couvert.
 *
 * Les deux formes marchent donc ici, et tout argument non reconnu arrete le
 * script plutot que de le laisser retomber sur `.env`.
 */
const positionnels = process.argv.slice(2).filter((a, i, tous) => {
  if (a.startsWith('--')) return false;
  const precedent = tous[i - 1];
  return precedent !== '--env' && precedent !== '--sortie';
});
if (positionnels.length > 1) {
  console.error(`Un seul fichier attendu, ${positionnels.length} recus : ${positionnels.join(', ')}`);
  process.exit(1);
}

const fichierEnv = argument('--env', positionnels[0] ?? '.env');
const dossierSortie = argument('--sortie', './sauvegardes');
config({ path: fichierEnv, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`Aucune DATABASE_URL dans ${fichierEnv}.`);
  process.exit(1);
}
const nomBase = url.split('/').pop()?.split('?')[0] ?? 'inconnue';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/** Les tables, lues sur le client généré plutôt que recopiées à la main. */
function tables() {
  return Object.keys(prisma)
    .filter(
      (cle) =>
        !cle.startsWith('$') &&
        !cle.startsWith('_') &&
        typeof prisma[cle]?.findMany === 'function',
    )
    .sort();
}

/**
 * Les BigInt et les Date ne survivent pas à `JSON.stringify` : le premier
 * lève, la seconde devient une chaîne ISO qu'on ne saurait plus distinguer
 * d'un texte. On marque donc leur type pour que la restauration les
 * reconstruise à l'identique.
 */
function encoder(_cle, valeur) {
  if (typeof valeur === 'bigint') return { __type: 'bigint', v: valeur.toString() };
  return valeur;
}

function remplacerDates(valeur) {
  if (valeur instanceof Date) return { __type: 'date', v: valeur.toISOString() };
  if (Array.isArray(valeur)) return valeur.map(remplacerDates);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, remplacerDates(v)]));
  }
  return valeur;
}

const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
const dossier = join(dossierSortie, `${nomBase}-${horodatage}`);
mkdirSync(dossier, { recursive: true });

console.log(`Sauvegarde de « ${nomBase} » vers ${dossier}`);

const manifeste = {
  base: nomBase,
  faite_le: new Date().toISOString(),
  outil: 'scripts/sauvegarde.mjs',
  avertissement:
    "Export logique des DONNÉES uniquement. Ne contient ni vues, ni fonctions, ni " +
    "politiques RLS, ni séquences. Le schéma se recrée par `prisma db push`. " +
    "Ne remplace pas la sauvegarde de l'hébergeur : la complète, pour le cas où le " +
    "problème viendrait de l'hébergeur lui-même.",
  tables: {},
};

let total = 0;
/**
 * Les tables que le schéma connaît mais que la base n'a pas encore.
 *
 * Le script levait sur la première d'entre elles et ne sauvegardait RIEN —
 * or une base en retard sur le schéma est précisément l'état où l'on
 * sauvegarde, juste avant de migrer. Refuser de protéger les données au
 * motif qu'une table future manque était le pire moment pour échouer.
 */
const absentes = [];
/**
 * Les tables lues en repli, parce que le schema du client depasse celui de
 * la base. Elles sont exportees — avec les colonnes que la base possede
 * reellement — et signalees, parce qu'une restauration doit savoir que ces
 * fichiers ne portent pas toutes les colonnes du schema courant.
 */
const partielles = [];

for (const table of tables()) {
  let lignes;
  try {
    lignes = await prisma[table].findMany();
  } catch (erreur) {
    // ── Lire le code, pas la phrase ───────────────────────────────────
    //
    // Prisma nomme ces deux cas et ne change pas leurs codes :
    //   P2021 — la table n'existe pas dans la base ;
    //   P2022 — la table existe, mais pas cette colonne.
    //
    // La distinction porte tout ce qui suit, et elle etait perdue : le
    // script reconnaissait la panne sur la prose du message, avec un
    // /does not exist/ qui attrapait les deux. Une table bien presente,
    // dont le schema etait seulement en retard d'une colonne, etait donc
    // classee « absente », ses lignes sautees, et le rapport final disait
    // « normal si la migration n'a pas encore ete passee ». Douze lignes
    // de conformite reelles sont passees a la trappe de cette facon, avec
    // une sortie qui ressemblait a une reussite.
    const code = erreur?.code;
    const detail = erreur?.meta?.driverAdapterError?.cause;

    if (code === 'P2021' || detail?.kind === 'TableDoesNotExist') {
      absentes.push(table);
      continue;
    }

    // ── Le repli : lire la table telle qu'elle est ────────────────────
    //
    // Une colonne que le client connait et que la base n'a pas encore,
    // c'est exactement l'etat d'une base qu'on s'apprete a migrer — donc
    // le moment precis ou la sauvegarde sert. Le `SELECT *` prend les
    // colonnes qui existent vraiment : mieux vaut des colonnes en moins
    // que des lignes en moins.
    const colonneAbsente = code === 'P2022' || detail?.kind === 'ColumnNotFound';
    if (!colonneAbsente || !/^[a-z_][a-z0-9_]*$/.test(table)) throw erreur;

    lignes = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
    partielles.push({ table, colonne_absente: detail?.column ?? null });
  }
  const contenu = JSON.stringify(remplacerDates(lignes), encoder);
  writeFileSync(join(dossier, `${table}.json`), contenu, 'utf8');
  manifeste.tables[table] = lignes.length;
  total += lignes.length;
  if (lignes.length > 0) console.log(`  ${table.padEnd(32)} ${lignes.length}`);
}

if (absentes.length > 0) {
  // Inscrit au manifeste, pas seulement affiché : une restauration doit
  // pouvoir savoir que ces tables n'existaient pas au moment de l'export,
  // plutôt que de croire qu'elles étaient vides.
  manifeste.tables_absentes = absentes;
  console.log(`\n  ${absentes.length} table(s) du schéma absente(s) de cette base, non exportée(s) :`);
  console.log(`    ${absentes.join(', ')}`);
  console.log('    (normal si la migration n’a pas encore été passée)');
}

if (partielles.length > 0) {
  manifeste.tables_partielles = partielles;
  console.log(`
  ${partielles.length} table(s) lue(s) en repli — la base est en retard sur le schema :`);
  for (const { table } of partielles) console.log(`    ${table}`);
  console.log('    (les lignes SONT sauvegardees, avec les colonnes que la base possede)');
}

manifeste.total_lignes = total;
writeFileSync(join(dossier, '_manifeste.json'), JSON.stringify(manifeste, null, 2), 'utf8');

console.log(`\n${Object.keys(manifeste.tables).length} tables, ${total} lignes.`);
console.log(`Manifeste : ${join(dossier, '_manifeste.json')}`);

await prisma.$disconnect();
