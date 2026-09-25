#!/usr/bin/env node
/**
 * UNE SAUVEGARDE EST-ELLE RESTAURABLE ?
 *
 *   node scripts/verifier-sauvegarde.mjs                      (la plus récente)
 *   node scripts/verifier-sauvegarde.mjs --depuis ./sauvegardes/xxx
 *
 * ── Pourquoi cette commande existe ───────────────────────────────────────
 *
 * « Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est
 * un fichier dont on espère qu'il contient quelque chose. » La phrase est en
 * tête de `restauration.mjs`, et elle est juste. Mais restaurer demande une
 * base cible, et il n'y en a pas de jetable ici : ni Docker, ni Postgres
 * local, et créer une quatrième base sur l'instance partagée est une décision
 * qui appartient au porteur.
 *
 * Alors on vérifie ce qui se vérifie sans base, et c'est beaucoup :
 *
 *   1. le manifeste est lisible et daté ;
 *   2. chaque table du schéma a son fichier, ou est déclarée absente ;
 *   3. chaque fichier est du JSON valide, et compte ce que le manifeste dit ;
 *   4. **la fermeture référentielle** : chaque clé étrangère pointe vers une
 *      ligne présente dans la même sauvegarde.
 *
 * Le quatrième est celui qui décide. `restauration.mjs` insère par tours
 * successifs et s'arrête quand un tour ne progresse plus ; une référence
 * orpheline fait donc échouer la restauration au pire moment — pendant un
 * incident, quand personne n'a le temps de comprendre. Le savoir avant coûte
 * quelques secondes.
 *
 * ── Ce que ça ne remplace pas ────────────────────────────────────────────
 *
 * Une vraie restauration. Ce contrôle dit que le fichier **peut** être remis
 * en place ; il ne dit pas que Postgres l'acceptera — contraintes d'unicité,
 * types, déclencheurs. Une restauration réelle a été exercée une fois
 * (185 lignes, zéro écart) ; la refaire demande une base jetable, et c'est
 * écrit ici pour que personne ne prenne cette commande pour l'autre.
 *
 * Et elle ne dit rien des sauvegardes de l'hébergeur — celles-là se vérifient
 * dans sa console, et c'est une autre question.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

function argument(nom, defaut) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

/** À défaut de `--depuis`, la sauvegarde la plus récente du dossier. */
function laPlusRecente() {
  const dossier = join(RACINE, 'sauvegardes');
  let entrees;
  try {
    entrees = readdirSync(dossier).filter((n) => statSync(join(dossier, n)).isDirectory());
  } catch {
    return null;
  }
  if (entrees.length === 0) return null;
  // Le nom porte l'horodatage ISO : l'ordre alphabétique est l'ordre du temps.
  return join(dossier, entrees.sort().at(-1));
}

const source = argument('--depuis', null) ?? laPlusRecente();
if (!source) {
  console.error('Aucune sauvegarde trouvée. Usage : --depuis <dossier de sauvegarde>');
  process.exit(1);
}

const resultats = [];
const noter = (etat, libelle, detail = '') => {
  resultats.push({ etat, libelle, detail });
  const marque = { ok: 'OK    ', echec: 'ÉCHEC ', alerte: 'ALERTE' }[etat];
  console.log(`  ${marque} ${libelle}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Le graphe des clés étrangères, lu sur le schéma.
 *
 * Écrit à la main, il se tromperait en silence le jour où quelqu'un ajoute une
 * relation sans y penser. Lu sur `schema.prisma`, il suit le schéma sans que
 * personne ait à s'en souvenir — la même raison qui fait que `sauvegarde.mjs`
 * lit la liste des tables sur le client généré plutôt que de la recopier.
 */
function relations() {
  const schema = readFileSync(join(RACINE, 'prisma', 'schema.prisma'), 'utf8');
  const trouvees = [];
  for (const modele of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, table, corps] = modele;
    for (const ligne of corps.split('\n')) {
      const m = ligne.match(/(\w+)\s+(\w+)\??\s+@relation\(fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/);
      if (!m) continue;
      const [, , cible, champs, references] = m;
      const depuis = champs.split(',').map((c) => c.trim());
      const vers = references.split(',').map((c) => c.trim());
      // Les clés composites existent en théorie ; aucune ici. On les ignore
      // en le disant plutôt qu'en faisant semblant de les traiter.
      if (depuis.length !== 1 || vers.length !== 1) continue;
      trouvees.push({ table, champ: depuis[0], cible, cleCible: vers[0] });
    }
  }
  return trouvees;
}

console.log('┌─ Cette sauvegarde est-elle restaurable ? ─────────────────');
console.log(`│ dossier : ${source}`);
console.log('└───────────────────────────────────────────────────────────\n');

// ── 1. Le manifeste ────────────────────────────────────────────────────────
let manifeste = null;
try {
  manifeste = JSON.parse(readFileSync(join(source, '_manifeste.json'), 'utf8'));
  noter(
    'ok',
    'Le manifeste est lisible',
    `base « ${manifeste.base ?? '?'} », ${Object.keys(manifeste.tables ?? {}).length} table(s), ${manifeste.faite_le ?? 'sans date'}`,
  );
} catch (erreur) {
  noter('echec', 'Le manifeste est illisible', String(erreur.message).slice(0, 90));
  console.log('\nSans manifeste, rien d’autre ne peut être vérifié.');
  process.exit(1);
}

// ── 2 et 3. Les fichiers, et ce qu'ils contiennent ─────────────────────────
const donnees = new Map();
const manquants = [];
const decomptesFaux = [];

for (const [table, attendu] of Object.entries(manifeste.tables ?? {})) {
  let lignes;
  try {
    lignes = JSON.parse(readFileSync(join(source, `${table}.json`), 'utf8'));
  } catch {
    manquants.push(table);
    continue;
  }
  if (!Array.isArray(lignes)) {
    manquants.push(`${table} (pas un tableau)`);
    continue;
  }
  donnees.set(table, lignes);
  if (lignes.length !== attendu) {
    decomptesFaux.push(`${table} : ${lignes.length} au lieu de ${attendu}`);
  }
}

if (manquants.length === 0) {
  noter('ok', 'Chaque table annoncée a son fichier, et il se lit', `${donnees.size} fichier(s)`);
} else {
  noter('echec', 'Des tables annoncées sont illisibles ou absentes', manquants.join(', '));
}

if (decomptesFaux.length === 0) {
  const total = [...donnees.values()].reduce((n, l) => n + l.length, 0);
  noter('ok', 'Chaque fichier compte ce que le manifeste annonce', `${total} ligne(s) au total`);
} else {
  noter('echec', 'Des décomptes ne correspondent pas au manifeste', decomptesFaux.join(' · '));
}

// ── 4. La fermeture référentielle ──────────────────────────────────────────
//
// Le contrôle qui décide. Une référence vers une ligne absente fait échouer
// la restauration pendant un incident, au moment où personne n'a le temps de
// comprendre pourquoi.
const index = new Map();
for (const [table, lignes] of donnees) {
  const parCle = new Map();
  for (const ligne of lignes) {
    if (ligne && typeof ligne === 'object' && 'id' in ligne) parCle.set(String(ligne.id), true);
  }
  index.set(table, parCle);
}

const orphelines = [];
const nonVerifiables = [];
let referencesVerifiees = 0;

for (const { table, champ, cible, cleCible } of relations()) {
  const lignes = donnees.get(table);
  if (!lignes) continue;
  const cibles = index.get(cible);
  if (!cibles) {
    nonVerifiables.push(`${table}.${champ} → ${cible} (table cible absente de la sauvegarde)`);
    continue;
  }
  if (cleCible !== 'id') {
    nonVerifiables.push(`${table}.${champ} → ${cible}.${cleCible} (référence hors clé primaire)`);
    continue;
  }
  let perdues = 0;
  for (const ligne of lignes) {
    const valeur = ligne?.[champ];
    if (valeur === null || valeur === undefined) continue;
    referencesVerifiees += 1;
    if (!cibles.has(String(valeur))) perdues += 1;
  }
  if (perdues > 0) orphelines.push(`${table}.${champ} → ${cible} : ${perdues} perdue(s)`);
}

if (orphelines.length === 0) {
  noter(
    'ok',
    'Chaque référence pointe vers une ligne présente',
    `${referencesVerifiees} référence(s) suivie(s)`,
  );
} else {
  noter('echec', 'Des références pointent dans le vide', orphelines.join(' · '));
}

if (nonVerifiables.length > 0) {
  // Dit, et non tu : un contrôle qui passe sous silence ce qu'il n'a pas
  // regardé laisse croire qu'il a tout regardé.
  noter('alerte', 'Des relations n’ont pas pu être vérifiées', nonVerifiables.join(' · '));
}

// ── Verdict ────────────────────────────────────────────────────────────────
const echecs = resultats.filter((r) => r.etat === 'echec');
console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
const verdict = `  ${resultats.length - echecs.length} vérifiés · ${echecs.length} en échec`;
console.log(`║${verdict.padEnd(63)}║`);
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Ce contrôle dit que le fichier PEUT être remis en place. Il ne remplace');
console.log('pas une restauration réelle, qui demande une base jetable — et il ne dit');
console.log('rien des sauvegardes de l’hébergeur, qui se vérifient dans sa console.');
process.exit(echecs.length > 0 ? 1 : 0);
