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
 * voie. On modifie donc aussi ce réglage — celui de `postgres`, qui est le
 * rôle sous lequel Prisma crée les tables, et c'est celui qui compte ici.
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

/**
 * Les privilèges par défaut, regardés séparément — et c'est le point.
 *
 * Une base peut n'avoir **aucun** droit accordé sur ses tables et porter
 * quand même le piège : `ALTER DEFAULT PRIVILEGES` ne se voit pas dans
 * `role_table_grants`, il n'agit que sur les tables à venir. Une base
 * fraîche est exactement ce cas.
 *
 * La première version s'arrêtait sur « rien à faire » dès que la première
 * requête revenait vide, sans jamais regarder ici : elle aurait laissé le
 * piège armé sur une base vide, en annonçant que tout allait bien.
 */
const defautsOuverts = await q(`
  SELECT pg_get_userbyid(d.defaclrole) AS par
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND array_to_string(d.defaclacl, ' ') ~ '(anon|authenticated)='`);

if (avant.length === 0 && defautsOuverts.length === 0) {
  console.log(
    '\nRien à faire : ni « anon » ni « authenticated » n’a de droit ici,' +
      '\net aucun privilège par défaut ne leur en rouvrirait.',
  );
  await client.end();
  process.exit(0);
}

console.log('\nDroits actuellement accordés :');
if (avant.length === 0) console.log('  aucun sur les tables existantes');
for (const a of avant) console.log(`  ${a.grantee.padEnd(14)} sur ${a.tables} table(s)`);
if (defautsOuverts.length > 0) {
  console.log(
    `  privilèges par défaut ouverts, posés par : ${[
      ...new Set(defautsOuverts.map((d) => d.par)),
    ].join(', ')}`,
  );
}

const sansRls = await q(`
  SELECT count(*)::int AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
console.log(`  dont ${sansRls[0].n} table(s) sans RLS — donc lisibles telles quelles.`);

// ── 2. Ce qu'on va écrire ────────────────────────────────────────────────
//
// Deux listes, et la distinction n'est pas cosmétique : la première est la
// correction, la seconde une précaution que l'hébergeur peut refuser.

/** Ceux qui comptent. Ils passent ensemble ou pas du tout. */
const obligatoires = [
  'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated',
  'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated',
  'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated',
  // Sans ceci, la prochaine table créée par Prisma repart avec tous les
  // droits : le trou se rouvrirait au prochain `db push`, en silence. C'est
  // `postgres` qui crée ces tables, donc c'est bien ce réglage-ci qui les
  // gouverne.
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated',
];

/**
 * Ceux qu'on tente sans en dépendre.
 *
 * `supabase_admin` a posé ses propres privilèges par défaut. Les retirer
 * demande d'être membre de ce rôle, ce que `postgres` n'est pas sur une
 * instance hébergée : Postgres répond « permission denied to change default
 * privileges ».
 *
 * La première version de ce script les mettait dans la même transaction que
 * les six autres. Résultat observé sur la vraie base : les six passaient,
 * le septième échouait, **tout était annulé et rien n'était corrigé** — pour
 * trois ordres qui ne changent rien ici. Un garde-fou qui empêche la
 * correction qu'il devait protéger est un garde-fou mal placé.
 *
 * Ils ne concerneraient que les tables créées *par* `supabase_admin` dans le
 * schéma public. Ignitux n'en crée aucune de cette façon : ses 50 tables
 * appartiennent à `postgres`, et `prisma db push` s'exécute sous ce rôle.
 * Leur échec laisse donc la correction entière.
 */
const precautions = [
  'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated',
  'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated',
  'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated',
];

console.log('\nOrdres à passer :');
for (const o of obligatoires) console.log(`  ${o};`);
console.log('\nTentés sans en dépendre (l’hébergeur peut les refuser) :');
for (const o of precautions) console.log(`  ${o};`);

if (!APPLIQUER) {
  console.log('\nAperçu seulement. Relancer avec --appliquer pour écrire.');
  console.log('Retour arrière, si besoin : GRANT ALL ON ALL TABLES IN SCHEMA public');
  console.log('                            TO anon, authenticated;');
  await client.end();
  process.exit(0);
}

// ── 3. Écriture ──────────────────────────────────────────────────────────

console.log('');
await client.query('BEGIN');
try {
  for (const o of obligatoires) {
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

// Hors transaction, et une par une : un refus sur l'une ne doit pas défaire
// les six qui viennent d'être validées.
const refusees = [];
for (const o of precautions) {
  try {
    await client.query(o);
    console.log(`  fait : ${o.slice(0, 62)}…`);
  } catch (erreur) {
    refusees.push(erreur.message);
  }
}

// ── 4. L'état, après — vérifié, pas supposé ─────────────────────────────

const apres = await q(`
  SELECT grantee, count(DISTINCT table_name)::int AS tables
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
  GROUP BY grantee`);

const lecture = await q('SELECT count(*)::int AS n FROM users');

console.log('\nAprès :');
console.log(
  `  droits restants pour anon/authenticated : ${
    apres.length === 0 ? 'aucun' : apres.map((a) => `${a.grantee}=${a.tables}`).join(' ')
  }`,
);
console.log(`  le produit lit toujours ses données : users = ${lecture[0].n} ligne(s)`);

if (refusees.length > 0) {
  console.log(`\n  ${refusees.length} précaution(s) refusée(s) par l’hébergeur — sans effet ici :`);
  console.log(`    ${refusees[0]}`);
  console.log('    Elles ne visaient que les tables créées par « supabase_admin » dans');
  console.log('    le schéma public. Ignitux n’en crée aucune de cette façon.');
}

await client.end();
