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

const fichierEnv = argument('--env', '.env');
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
for (const table of tables()) {
  const lignes = await prisma[table].findMany();
  const contenu = JSON.stringify(remplacerDates(lignes), encoder);
  writeFileSync(join(dossier, `${table}.json`), contenu, 'utf8');
  manifeste.tables[table] = lignes.length;
  total += lignes.length;
  if (lignes.length > 0) console.log(`  ${table.padEnd(32)} ${lignes.length}`);
}

manifeste.total_lignes = total;
writeFileSync(join(dossier, '_manifeste.json'), JSON.stringify(manifeste, null, 2), 'utf8');

console.log(`\n${Object.keys(manifeste.tables).length} tables, ${total} lignes.`);
console.log(`Manifeste : ${join(dossier, '_manifeste.json')}`);

await prisma.$disconnect();
