/**
 * CE QUE `dist/` IMPORTE DOIT ÊTRE INSTALLÉ EN PRODUCTION.
 *
 *   node scripts/verifier-dependances.mjs
 *
 * ── Le défaut que ce contrôle empêche ────────────────────────────────────
 *
 * L'image Docker installe `npm ci --omit=dev`, donc les `devDependencies`
 * n'y sont pas. Or `@prisma/client` et `dotenv` y étaient rangés, et `dist/`
 * les importe tous les deux. **L'image ne pouvait pas démarrer** :
 *
 *     Cannot find package 'dotenv' imported from /app/dist/main.js
 *
 * Personne ne l'avait vu, et c'est logique : la CI **construit** l'image et
 * ne la **lance** jamais, le développement tourne avec toutes les
 * dépendances installées, et les 1 300 tests s'exécutent dans ce même
 * environnement complet. Un paquet mal rangé y est parfaitement invisible.
 *
 * ── Pourquoi un script et pas un test ────────────────────────────────────
 *
 * Le contrôle porte sur `dist/`, donc il exige une compilation à jour. Un
 * test unitaire qui la déclencherait mettrait une minute et la ferait deux
 * fois. Ici il se lance après `npm run build`, en CI comme à la main, et
 * coûte une seconde.
 *
 * ── Ce qu'il ne dit pas ──────────────────────────────────────────────────
 *
 * Qu'un paquet soit installé ne prouve pas que l'application démarre : il
 * reste la configuration, la base, les migrations. Il prouve seulement
 * qu'aucun `import` ne tombera dans le vide — ce qui était exactement la
 * panne.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const pj = JSON.parse(readFileSync('package.json', 'utf8'));
const production = new Set(Object.keys(pj.dependencies ?? {}));
const developpement = new Set(Object.keys(pj.devDependencies ?? {}));

/**
 * Les paquets importés par le code compilé.
 *
 * On lit `dist/` et non `src/` : c'est ce qui est copié dans l'image, et
 * c'est le seul endroit où l'on voit ce que le code demande réellement une
 * fois transpilé — les types disparaissent, les `import type` aussi.
 */
function paquetsImportes(dossier) {
  const trouves = new Set();
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      for (const p of paquetsImportes(chemin)) trouves.add(p);
      continue;
    }
    if (!entree.name.endsWith('.js')) continue;
    const source = readFileSync(chemin, 'utf8');
    for (const trouve of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const specificateur = trouve[1];
      // Chemins relatifs et modules natifs : rien à installer.
      if (specificateur.startsWith('.') || specificateur.startsWith('node:')) continue;
      // Un nom de paquet valide, pour ne pas ramasser les faux positifs
      // qu'une expression régulière finit toujours par attraper dans du
      // code minifié ou des chaînes de caractères.
      const nom = specificateur.startsWith('@')
        ? specificateur.split('/').slice(0, 2).join('/')
        : specificateur.split('/')[0];
      if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(nom)) continue;
      trouves.add(nom);
    }
  }
  return trouves;
}

let importes;
try {
  importes = paquetsImportes('dist');
} catch {
  console.error("Aucun `dist/`. Lancer d'abord : npm run build");
  process.exit(1);
}

/** Modules natifs écrits sans le préfixe `node:`. */
const NATIFS = new Set([
  'assert', 'buffer', 'child_process', 'crypto', 'dns', 'events', 'fs', 'http', 'http2',
  'https', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring', 'readline',
  'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'worker_threads', 'zlib',
]);

const manquants = [...importes]
  .filter((nom) => !NATIFS.has(nom) && !production.has(nom))
  .sort();

console.log('┌─ Dépendances du code compilé ─────────────────────────────');
console.log(`│ paquets importés par dist/ : ${importes.size}`);
console.log(`│ déclarés en dependencies   : ${production.size}`);
console.log('└───────────────────────────────────────────────────────────\n');

if (manquants.length === 0) {
  console.log('Tout ce que `dist/` importe est installé en production.');
  process.exit(0);
}

console.log('ABSENTS DE `dependencies` — l’image ne démarrerait pas :\n');
for (const nom of manquants) {
  const ou = developpement.has(nom) ? 'rangé en devDependencies' : 'absent du package.json';
  console.log(`  ${nom.padEnd(28)} ${ou}`);
}
console.log('\n`npm ci --omit=dev` ne les installera pas, et `node dist/main` s’arrêtera');
console.log("sur « Cannot find package » au premier import. Les déplacer vers");
console.log('`dependencies`, puis relancer `npm install --package-lock-only`.');
process.exit(1);
