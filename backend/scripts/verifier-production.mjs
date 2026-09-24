/**
 * LE DÉPLOIEMENT À BLANC — poser les questions du démarrage sans démarrer.
 *
 *   node scripts/verifier-production.mjs
 *   node scripts/verifier-production.mjs .env.production
 *
 * ── Pourquoi une commande de plus ────────────────────────────────────────
 *
 * Le contrôle de production existe déjà, dans `production-preflight.ts`, et
 * il est bon : il refuse de démarrer sur un secret d'exemple, une adresse
 * locale, un `TRUST_PROXY` absent. Mais il ne s'exécute **qu'au démarrage**,
 * et il tue le processus.
 *
 * Autrement dit : on découvre ce qui manque au pire moment — pendant le
 * déploiement, devant un journal d'hébergeur, après avoir poussé. Ce script
 * pose exactement les mêmes questions, à froid, avant de pousser quoi que ce
 * soit. Il ne démarre rien et n'écrit nulle part.
 *
 * ── Ce qu'il ajoute au contrôle de démarrage ─────────────────────────────
 *
 * Trois vérifications que le contrôle ne peut pas faire, parce qu'elles
 * demandent de sortir du processus :
 *
 *   — la base répond-elle vraiment, et son schéma est-il à jour ;
 *   — l'adresse du frontend existe-t-elle, ou est-ce un domaine acheté mais
 *     pas encore branché ;
 *   — le serveur SMTP accepte-t-il une connexion, quand on en déclare un.
 *
 * Une configuration peut passer le contrôle de démarrage et pourtant ne
 * servir personne : une \`FRONTEND_URL\` en https, bien formée, vers un
 * domaine qui ne résout pas, laisse CORS refuser tout le monde — et le
 * serveur, lui, démarre content.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const drapeauEnv = process.argv.indexOf('--env');
const fichier =
  drapeauEnv >= 0 && process.argv[drapeauEnv + 1]
    ? process.argv[drapeauEnv + 1]
    : (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.env.production');

/** Lit le fichier sans passer par dotenv : on ne veut RIEN poser dans process.env. */
function lireEnv(chemin) {
  const valeurs = {};
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    valeurs[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return valeurs;
}

let candidat;
try {
  candidat = lireEnv(fichier);
} catch (erreur) {
  console.error(`Impossible de lire ${fichier} : ${erreur.message}`);
  process.exit(1);
}

// Le contrôle ne s'applique qu'en production. On le force ici : le but est
// justement de savoir ce qui se passerait là-bas.
candidat.NODE_ENV = 'production';

const { productionProblems } = await import('../dist/config/production-preflight.js').catch(() => {
  console.error("Backend non compilé. Lancer d'abord : npm run build");
  process.exit(1);
});

/**
 * On passe par le MÊME schéma que le démarrage, et pas par `process.env`.
 *
 * La première version donnait l'environnement brut au contrôle. Or le vrai
 * démarrage valide d'abord avec zod, qui **retire les clés qu'il ne connaît
 * pas** — si bien que ce script annonçait « 1 bloquant » là où le serveur en
 * comptait quatre, et donnait la permission de déployer une configuration
 * qui ne démarrerait pas.
 *
 * Un contrôle à blanc plus optimiste que la réalité est pire que pas de
 * contrôle. Il emprunte donc exactement le même chemin, et si le schéma
 * change demain, les deux changent ensemble.
 */
const { envSchema } = await import('../dist/config/env.js');
const valide = envSchema.safeParse(candidat);
if (!valide.success) {
  console.log('Configuration invalide — le serveur refuserait de démarrer :\n');
  for (const souci of valide.error.issues) {
    console.log(`  ${String(souci.path.join('.')).padEnd(24)} ${souci.message}`);
  }
  console.log('\nCes fautes portent sur la FORME des variables. Les corriger, puis relancer.');
  process.exit(1);
}
const candidatValide = valide.data;

console.log('┌─ Déploiement à blanc ─────────────────────────────────────');
console.log(`│ fichier : ${fichier}`);
console.log(`│ mode    : lecture seule, rien ne démarre`);
console.log('└───────────────────────────────────────────────────────────\n');

const bloquants = [];
const avertissements = [];

// ── 1. Le contrôle de démarrage, tel quel ────────────────────────────────

const problemes = productionProblems(candidatValide);
console.log('Contrôle de démarrage :');
if (problemes.length === 0) {
  console.log('  ok — le serveur accepterait de démarrer avec cette configuration.');
} else {
  for (const p of problemes) {
    console.log(`  REFUS  ${p.setting}`);
    console.log(`         ${p.detail}`);
    bloquants.push(`${p.setting} — ${p.detail.split('.')[0]}.`);
  }
}

// ── 2. La base répond-elle, et son schéma est-il à jour ──────────────────

console.log('\nBase de données :');
if (!candidat.DATABASE_URL) {
  console.log('  ignoré — aucune DATABASE_URL.');
} else {
  const adresse = new URL(candidat.DATABASE_URL);
  const client = new Client({ connectionString: candidat.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const comptes = await client
      .query('SELECT count(*)::int AS n FROM users')
      .then((r) => r.rows[0].n)
      .catch(() => null);
    console.log(`  ok — ${adresse.pathname.slice(1)} répond, ${rows[0].n} table(s)`);
    if (comptes !== null) console.log(`       ${comptes} compte(s) existant(s)`);
    // Le nombre exact vit dans verifier-base.mjs ; ici on signale seulement
    // l'ordre de grandeur, pour attraper une base vide ou à moitié migrée.
    if (rows[0].n < 40) {
      avertissements.push(
        `La base ne porte que ${rows[0].n} tables. Lancer : node scripts/verifier-base.mjs ${fichier}`,
      );
    }
    await client.end();
  } catch (erreur) {
    console.log(`  INJOIGNABLE — ${String(erreur.message).slice(0, 90)}`);
    bloquants.push('La base ne répond pas.');
  }
}

// ── 3. L'adresse du frontend existe-t-elle vraiment ──────────────────────

console.log('\nAdresse du frontend :');
const frontend = candidat.FRONTEND_URL ?? '';
if (!frontend) {
  console.log('  ignoré — FRONTEND_URL vide (déjà signalé ci-dessus).');
} else {
  try {
    const reponse = await fetch(frontend, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`  ok — ${frontend} répond (HTTP ${reponse.status})`);
  } catch (erreur) {
    console.log(`  NE RÉPOND PAS — ${frontend}`);
    console.log(`     ${String(erreur.message).slice(0, 80)}`);
    // Pas bloquant : on déploie souvent le serveur avant l'interface. Mais
    // il faut le savoir, parce que le contrôle de démarrage, lui, laissera
    // passer — l'adresse est bien formée, elle ne mène simplement nulle part,
    // et CORS refusera tout le monde en silence.
    avertissements.push(
      `${frontend} ne répond pas. Le serveur démarrera quand même, et CORS refusera tout le monde.`,
    );
  }
}

// ── 4. L'email part-il vraiment ──────────────────────────────────────────

console.log('\nEnvoi des emails :');
if (candidat.MAIL_TRANSPORT !== 'smtp') {
  console.log(`  MAIL_TRANSPORT = « ${candidat.MAIL_TRANSPORT ?? '(vide)'} »`);
  console.log('  Les mots de passe oubliés ne partiront pas : ils seront écrits dans le');
  console.log('  journal du serveur. C’est une réponse valide pour une bêta fermée, à');
  console.log('  condition de la connaître — le premier oubli de mot de passe est sinon');
  console.log('  définitif, et la personne est enfermée dehors sans recours.');
  avertissements.push('Aucun email ne part réellement (MAIL_TRANSPORT ≠ smtp).');
} else {
  const hote = candidat.SMTP_HOST;
  const port = Number(candidat.SMTP_PORT);
  const joignable = await new Promise((resoudre) => {
    const prise = connect({ host: hote, port, timeout: 8000 });
    prise.on('connect', () => (prise.destroy(), resoudre(true)));
    prise.on('error', () => resoudre(false));
    prise.on('timeout', () => (prise.destroy(), resoudre(false)));
  });
  if (joignable) {
    console.log(`  ok — ${hote}:${port} accepte une connexion`);
    console.log('  (la connexion ne prouve pas que les identifiants sont bons —');
    console.log('   seul un vrai envoi le dira, une fois déployé)');
  } else {
    console.log(`  INJOIGNABLE — ${hote}:${port}`);
    bloquants.push(`Le serveur SMTP ${hote}:${port} ne répond pas.`);
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log(
  `║  ${bloquants.length} bloquant(s) · ${avertissements.length} avertissement(s)`.padEnd(64) + '║',
);
console.log('╚═══════════════════════════════════════════════════════════════╝');

if (bloquants.length) {
  console.log('\nBLOQUANTS — le déploiement échouerait ou ne servirait personne :');
  for (const b of bloquants) console.log(`  • ${b}`);
}
if (avertissements.length) {
  console.log('\nAVERTISSEMENTS — ça démarrera, mais il faut le savoir :');
  for (const a of avertissements) console.log(`  • ${a}`);
}
if (!bloquants.length && !avertissements.length) {
  console.log('\nRien à signaler. Cette configuration peut partir.');
}

process.exit(bloquants.length > 0 ? 1 : 0);
