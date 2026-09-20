#!/usr/bin/env node
/**
 * RESTAURATION D'UNE SAUVEGARDE LOGIQUE.
 *
 * Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est
 * un fichier dont on espère qu'il contient quelque chose. Ce script existe
 * pour que la restauration soit une opération **exercée**, pas une intention.
 *
 * ## L'ordre d'insertion
 *
 * Les clés étrangères imposent un ordre : on ne peut pas insérer un projet
 * avant son propriétaire. Plutôt que de calculer un tri topologique — qu'il
 * faudrait maintenir à chaque relation ajoutée, et qui se tromperait en
 * silence le jour où on l'oublie — on procède par tours : à chaque tour, on
 * insère ce qui passe, et on retente le reste au tour suivant. Tant qu'un
 * tour progresse, on continue.
 *
 * C'est plus lent qu'un tri, et c'est assumé : une restauration se fait
 * rarement, sous tension, et la propriété qui compte alors est de ne pas
 * dépendre d'une liste que quelqu'un aurait oublié de mettre à jour.
 *
 * ## Garde-fou
 *
 * Refuse d'écrire dans une base qui contient déjà des données, sauf
 * `--ecraser` explicite. Restaurer par-dessus de vraies données est la
 * façon la plus efficace de transformer un incident en catastrophe.
 *
 * ## Usage
 *
 *   node scripts/restauration.mjs --depuis ./sauvegardes/xxx --vers "postgresql://..."
 *   node scripts/restauration.mjs --depuis ./sauvegardes/xxx --env .env.test
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

function argument(nom, defaut) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const source = argument('--depuis', null);
const ecraser = process.argv.includes('--ecraser');
if (!source) {
  console.error('Usage : --depuis <dossier de sauvegarde> [--vers <url> | --env <fichier>]');
  process.exit(1);
}

let url = argument('--vers', null);
if (!url) {
  config({ path: argument('--env', '.env'), quiet: true });
  url = process.env.DATABASE_URL;
}
if (!url) {
  console.error('Aucune base cible.');
  process.exit(1);
}
const nomCible = url.split('/').pop()?.split('?')[0] ?? 'inconnue';

const manifeste = JSON.parse(readFileSync(join(source, '_manifeste.json'), 'utf8'));
console.log(`Restauration de « ${manifeste.base} » (${manifeste.faite_le}) vers « ${nomCible} »`);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/** Reconstruit les types que JSON ne sait pas porter. */
function decoder(valeur) {
  if (Array.isArray(valeur)) return valeur.map(decoder);
  if (valeur && typeof valeur === 'object') {
    if (valeur.__type === 'date') return new Date(valeur.v);
    if (valeur.__type === 'bigint') return BigInt(valeur.v);
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, decoder(v)]));
  }
  return valeur;
}

const tables = readdirSync(source)
  .filter((f) => f.endsWith('.json') && f !== '_manifeste.json')
  .map((f) => f.replace(/\.json$/, ''));

// ── Garde-fou : la cible est-elle vide ? ───────────────────────────────────
let dejaPresent = 0;
for (const table of tables) {
  if (typeof prisma[table]?.count !== 'function') continue;
  dejaPresent += await prisma[table].count();
}
if (dejaPresent > 0 && !ecraser) {
  console.error(
    `\nLa base « ${nomCible} » contient déjà ${dejaPresent} ligne(s).\n` +
      "Restaurer par-dessus de vraies données transforme un incident en catastrophe.\n" +
      'Relance avec --ecraser si c’est bien ce que tu veux.',
  );
  await prisma.$disconnect();
  process.exit(1);
}

// ── Insertion par tours ────────────────────────────────────────────────────
const restantes = new Map();
for (const table of tables) {
  const lignes = decoder(JSON.parse(readFileSync(join(source, `${table}.json`), 'utf8')));
  if (lignes.length > 0) restantes.set(table, lignes);
}

let tour = 0;
let inserees = 0;
const echecs = new Map();

while (restantes.size > 0) {
  tour += 1;
  let progres = 0;
  for (const [table, lignes] of [...restantes.entries()]) {
    try {
      // `createMany` en une fois : si une seule ligne viole une clé
      // étrangère, tout le lot échoue et la table repart au tour suivant.
      await prisma[table].createMany({ data: lignes, skipDuplicates: true });
      inserees += lignes.length;
      progres += lignes.length;
      restantes.delete(table);
      echecs.delete(table);
      console.log(`  tour ${tour} · ${table.padEnd(32)} ${lignes.length}`);
    } catch (error) {
      echecs.set(table, error instanceof Error ? error.message : String(error));
    }
  }
  if (progres === 0) break;
}

// ── Vérification ───────────────────────────────────────────────────────────
console.log('\nVérification ligne à ligne :');
let ecarts = 0;
for (const [table, attendu] of Object.entries(manifeste.tables)) {
  if (typeof prisma[table]?.count !== 'function') continue;
  const reel = await prisma[table].count();
  if (reel !== attendu) {
    ecarts += 1;
    console.log(`  ✗ ${table.padEnd(32)} attendu ${attendu}, trouvé ${reel}`);
  }
}

if (restantes.size > 0) {
  console.log(`\n${restantes.size} table(s) n'ont pas pu être insérées :`);
  for (const [table, raison] of echecs) {
    console.log(`  ✗ ${table} — ${String(raison).slice(0, 160)}`);
  }
}

console.log(
  `\n${inserees} ligne(s) restaurées en ${tour} tour(s). ` +
    `${ecarts === 0 && restantes.size === 0 ? 'Aucun écart.' : `${ecarts} écart(s).`}`,
);

await prisma.$disconnect();
process.exit(ecarts === 0 && restantes.size === 0 ? 0 : 1);
