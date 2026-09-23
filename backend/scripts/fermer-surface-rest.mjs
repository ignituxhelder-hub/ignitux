/**
 * FERMER LA SURFACE REST — retirer à `anon` et `authenticated` des droits
 * qu'Ignitux ne leur a jamais demandés.
 *
 *   node scripts/fermer-surface-rest.mjs                  (montre, ne fait rien)
 *   node scripts/fermer-surface-rest.mjs --appliquer
 *   node scripts/fermer-surface-rest.mjs .env.production --appliquer
 *
 * ── Le problème, dit simplement ──────────────────────────────────────────
 *
 * Supabase héberge le Postgres d'Ignitux, et rien d'autre : aucun paquet
 * `@supabase` n'est installé, aucune clé n'est dans le dépôt, le produit
 * parle à la base par Prisma. Mais l'hébergeur monte d'office une API REST
 * (PostgREST) devant ce même Postgres, et lui donne deux rôles — `anon`
 * pour les requêtes non authentifiées, `authenticated` pour les autres.
 *
 * Ces deux rôles ont reçu `arwdDxtm` — soit SELECT, INSERT, UPDATE, DELETE
 * et TRUNCATE — sur **toutes** les tables du schéma public. Et la sécurité
 * par ligne (RLS) n'est active que sur `users`. Autrement dit : la seule
 * chose qui sépare Internet de chaque ligne de la base est la clé `anon` —
 * une clé que le modèle Supabase considère comme **publique**, puisqu'elle
 * est faite pour être posée dans du code de navigateur.
 *
 * Ce modèle tient quand on utilise Supabase comme prévu : clé publique
 * devant, RLS derrière. Ignitux n'utilise ni l'une ni l'autre. Il reste donc
 * la porte, sans la serrure, devant une pièce où personne n'a affaire.
 *
 * ── Pourquoi fermer plutôt qu'activer RLS ────────────────────────────────
 *
 * Activer RLS sur cinquante tables demanderait d'écrire cinquante jeux de
 * politiques — pour un chemin d'accès que le produit n'emprunte jamais.
 * Chacune serait du code non exécuté, donc non éprouvé, donc faux tôt ou
 * tard. Retirer les droits supprime la surface au lieu de la garder sous
 * surveillance.
 *
 * ── Pourquoi c'est sans risque pour le produit ───────────────────────────
 *
 * Les cinquante tables appartiennent à `postgres`, qui est exactement le
 * rôle par lequel Ignitux se connecte. Un propriétaire garde ses droits
 * quoi qu'on révoque aux autres. Le script le vérifie avant d'écrire quoi
 * que ce soit, et s'arrête si ce n'est pas le cas.
 *
 * ── Le piège des privilèges par défaut ───────────────────────────────────
 *
 * Révoquer sur les tables existantes ne suffit pas : `ALTER DEFAULT
 * PRIVILEGES` redonne tout à `anon` sur chaque table **future**. Le trou se
 * rouvrirait donc au prochain `prisma db push`, sans que personne ne le
 * voie. On modifie aussi ces valeurs par défaut, pour les deux rôles qui
 * les ont posées.
 */
import { createRequire } from 'node:module';
import { config } from 'dotenv';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const drapeauEnv = process.argv.indexOf('--env');
const fichier =
  drapeauEnv >= 0 && process.argv[drapeauEnv + 1]
    ? process.argv[drapeauEnv + 1]
    : (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.env');
const APPLIQUER = process.argv.includes('--appliquer');

config({ path: fichier, quiet: true });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`Aucune DATABASE_URL dans ${fichier}.`);
  process.exit(1);
}

const adresse = new URL(url);
const base = adresse.pathname.slice(1);

console.log('┌─ Fermeture de la surface REST ────────────────────────────');
console.log(`│ fichier : ${fichier}`);
console.log(`│ hôte    : ${adresse.hostname}`);
console.log(`│ base    : ${base}`);
console.log(`│ mode    : ${APPLIQUER ? 'APPLIQUER' : 'aperçu (rien ne sera écrit)'}`);
console.log('└───────────────────────────────────────────────────────────\n');

const client = new Client({ connectionString: url });
await client.connect();
const q = async (sql) => (await client.query(sql)).rows;

// ── 1. L'état, avant ──────────────────────────────────────────────────────

const [{ moi }] = await q('SELECT current_user AS moi');
const proprietaires = await q(`
  SELECT pg_get_userbyid(c.relowner) AS proprietaire, count(*)::int AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r'
  GROUP BY 1`);

const etrangeres = proprietaires.filter((p) => p.proprietaire !== moi);
console.log(`Connecté comme « ${moi} ».`);
console.log(
  `Tables du schéma public : ${proprietaires.map((p) => `${p.n} à ${p.proprietaire}`).join(', ')}`,
);

if (etrangeres.length > 0) {
  console.error(
    '\nARRÊT. Des tables appartiennent à un autre rôle que celui de la connexion :\n' +
      `  ${etrangeres.map((p) => `${p.n} à ${p.proprietaire}`).join(', ')}\n` +
      "Révoquer ici pourrait couper l'accès du produit à ses propres données.",
  );
  await client.end();
  process.exit(1);
}

const avant = await q(`
  SELECT grantee, count(DISTINCT table_name)::int AS tables
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
  GROUP BY grantee ORDER BY grantee`);

if (avant.length === 0) {
  console.log('\nRien à faire : ni « anon » ni « authenticated » n’a de droit ici.');
  await client.end();
  process.exit(0);
}

console.log('\nDroits actuellement accordés :');
for (const a of avant) console.log(`  ${a.grantee.padEnd(14)} sur ${a.tables} table(s)`);

const sansRls = await q(`
  SELECT count(*)::int AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
console.log(`  dont ${sansRls[0].n} table(s) sans RLS — donc lisibles telles quelles.`);

// ── 2. Ce qu'on va écrire ────────────────────────────────────────────────

const ordres = [
  `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`,
  `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`,
  `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated`,
  // Sans ceci, la prochaine table créée par Prisma repart avec tous les
  // droits : le trou se rouvrirait au prochain `db push`, en silence.
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`,
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated`,
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated`,
  // `supabase_admin` a posé les siens séparément ; les laisser laisserait la
  // moitié du piège en place.
  `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`,
  `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated`,
  `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated`,
];

console.log('\nOrdres à passer :');
for (const o of ordres) console.log(`  ${o};`);

if (!APPLIQUER) {
  console.log('\nAperçu seulement. Relancer avec --appliquer pour écrire.');
  console.log('Retour arrière, si besoin : GRANT ALL ON ALL TABLES IN SCHEMA public');
  console.log('                            TO anon, authenticated;');
  await client.end();
  process.exit(0);
}

// ── 3. Écriture, d'un bloc ───────────────────────────────────────────────

console.log('');
await client.query('BEGIN');
try {
  for (const o of ordres) {
    await client.query(o);
    console.log(`  fait : ${o.slice(0, 62)}…`);
  }
  await client.query('COMMIT');
} catch (erreur) {
  await client.query('ROLLBACK');
  console.error('\nÉchec — rien n’a été modifié.');
  console.error(erreur.message);
  await client.end();
  process.exit(1);
}

// ── 4. L'état, après — vérifié, pas supposé ─────────────────────────────

const apres = await q(`
  SELECT grantee, count(DISTINCT table_name)::int AS tables
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
  GROUP BY grantee`);

const lecture = await q(`SELECT count(*)::int AS n FROM users`);

console.log('\nAprès :');
console.log(
  `  droits restants pour anon/authenticated : ${
    apres.length === 0 ? 'aucun' : apres.map((a) => `${a.grantee}=${a.tables}`).join(' ')
  }`,
);
console.log(`  le produit lit toujours ses données : users = ${lecture[0].n} ligne(s)`);

await client.end();
