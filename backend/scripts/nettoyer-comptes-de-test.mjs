/**
 * EFFACER LES COMPTES QUE MES HARNAIS ONT LAISSÉS — et rien d'autre.
 *
 *   node scripts/nettoyer-comptes-de-test.mjs             (montre, n'efface rien)
 *   node scripts/nettoyer-comptes-de-test.mjs --appliquer
 *
 * ── Pourquoi ce script existe ────────────────────────────────────────────
 *
 * Les harnais d'exécution réelle — `validation-reelle`, `simulation-beta`,
 * `traversee-ecrans`, `parcours-premier-utilisateur` — créent un compte à
 * chaque lancement et n'en effacent aucun. Après deux jours : **238 comptes
 * en base, dont 6 seulement appartiennent à de vraies personnes.**
 *
 * Ce n'est pas grave en soi, la base de développement peut bien porter du
 * bruit. Ça le devient pour l'audit financier, qui signale les répartitions
 * de capital incomplètes : les trois qu'il remonte aujourd'hui viennent
 * toutes de mes propres exécutions. Un audit dont on apprend à ignorer les
 * constats ne sert plus à rien.
 *
 * ── Le piège, et c'est tout l'objet de ce fichier ────────────────────────
 *
 * La commande évidente serait :
 *
 *     DELETE FROM users WHERE email LIKE '%@ignitux.test'
 *
 * Elle effacerait **testeur1@ignitux.test et testeur2@ignitux.test**, qui
 * sont de vraies personnes, sur la même terminaison que mes jetables. Le
 * premier porte un projet réel.
 *
 * Ce script ne procède donc jamais par exclusion. Il part d'une **liste
 * fermée de préfixes** que seuls mes harnais utilisent, et tout ce qui n'y
 * figure pas est conservé — y compris un compte de test que je n'aurais pas
 * prévu. Se tromper en gardant trop coûte un peu d'espace ; se tromper en
 * gardant trop peu coûte les données de quelqu'un.
 *
 * ── Pourquoi pas un DELETE ───────────────────────────────────────────────
 *
 * `constitution_violations` et `ai_usage_events` ne portent aucune clé
 * étrangère vers `users` : rien n'y cascade, et un DELETE brut y laisserait
 * des identifiants pointant vers des comptes disparus. Le produit, lui, les
 * **anonymise** — le fait reste vérifiable, la personne part. Ce script
 * rejoue exactement la transaction de `deleteAccount`, sans la vérification
 * du mot de passe, qui n'a de sens que pour le titulaire du compte.
 */
import { config } from 'dotenv';

const drapeauEnv = process.argv.indexOf('--env');
const fichier =
  drapeauEnv >= 0 && process.argv[drapeauEnv + 1]
    ? process.argv[drapeauEnv + 1]
    : (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.env');
const APPLIQUER = process.argv.includes('--appliquer');

config({ path: fichier, quiet: true });
if (!process.env.DATABASE_URL) {
  console.error(`Aucune DATABASE_URL dans ${fichier}.`);
  process.exit(1);
}

/**
 * Les préfixes que mes harnais emploient, et eux seuls.
 *
 * Liste fermée, tenue à la main : ajouter un harnais demande d'ajouter son
 * préfixe ici, et c'est voulu. Une expression qui attraperait « tout ce qui
 * ressemble à un test » finirait par attraper un vrai compte.
 */
const PREFIXES = [
  'validation',
  // `scripts/hors-ligne.mjs` — il rend le compte qu'il crée, mais un harnais
  // interrompu en laisse un derrière lui, et il faut pouvoir le ramasser.
  'horsligne',
  // `scripts/courrier-reel.mjs` — le compte du parcours, et l'adresse
  // inconnue qu'il interroge pour vérifier qu'elle ne se distingue pas.
  'courrier',
  'personne',
  // Comptes de sondage créés à la main pendant une mise au point : mise au
  // point du service worker (`sw`), du lien de mot de passe (`lien`), et
  // sondages ponctuels de la forme des réponses (`sonde`).
  'sw',
  'lien',
  'sonde',
  'sonde2',
  'sonde3',
  'sondecom',
  'sondesup',
  'sondea',
  'sondeb',
  'sim',
  'traversee',
  'parcours',
  'autotest',
  'diag',
  'diag2',
  'pageload',
  'roles',
  'roles2',
  'roleetat',
  'voir',
  'creer',
  'pp',
  'av',
  'tache',
  'ou',
  'cases',
  'ch',
  'vc',
  'pt',
  'cas',
  'crm',
  'hl',
  'hl2',
  'hl3',
  'hl4',
  'rgpd',
  'rgpd2',
  'alice',
  'bob',
  'carole',
  'inv',
  'inv2',
  'porteur',
  'porteur2',
  'investisseur',
  'enum',
  'reset',
  'fact',
  'fact2',
  'fact3',
  'num',
  'tot',
  'tot2',
  'pay',
  'const',
  'compta',
  'audit',
  'mesure',
  'verif413',
];

/** Jamais effacés, quoi qu'il arrive. Ceinture et bretelles. */
const INTOUCHABLES = [/^testeur\d*@/i, /^helder/i];

const { PrismaClient } = await import('../dist/generated/prisma/client.js');
const { PrismaPg } = await import('@prisma/adapter-pg');
const { ledgerDeletionOperations } = await import('../dist/ledger/ledger-deletion.js');
const { investorsDeletionOperations } = await import('../dist/investors/investors-deletion.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const adresse = new URL(process.env.DATABASE_URL);
const base = adresse.pathname.slice(1);

console.log('┌─ Nettoyage des comptes de test ───────────────────────────');
console.log(`│ hôte    : ${adresse.hostname}`);
console.log(`│ base    : ${base}`);
console.log(`│ mode    : ${APPLIQUER ? 'APPLIQUER' : 'aperçu, rien ne sera effacé'}`);
console.log('└───────────────────────────────────────────────────────────\n');

/*
 * Ce script efface des comptes. Il n'a rien à faire en production.
 *
 * Les trois bases vivent sur la même instance et portent des noms voisins :
 * un `--env` de travers, et l'on efface chez de vraies personnes. Que
 * `ignitux_prod` soit vide aujourd'hui ne protège rien — c'est une
 * circonstance, pas un garde-fou.
 *
 * La liste fermée de préfixes en garderait la plupart, mais un compte réel
 * nommé « sim.quelquechose@ignitux.test » passerait au travers. Deux filets
 * valent mieux qu'un quand le second est une ligne.
 */
if (base === 'ignitux_prod' && !process.argv.includes('--oui-en-production')) {
  console.error('ARRÊT. La cible est la base de PRODUCTION.');
  console.error('');
  console.error('Ce script efface des comptes : il est fait pour nettoyer les débris');
  console.error('des harnais d’exécution, qui ne tournent jamais en production.');
  console.error('');
  console.error('Si c’est vraiment l’intention : ajouter --oui-en-production.');
  await prisma.$disconnect();
  process.exit(1);
}

const tous = await prisma.users.findMany({
  select: { id: true, email: true, _count: { select: { projects: true } } },
});

const jetable = (email) => {
  if (INTOUCHABLES.some((motif) => motif.test(email))) return false;
  if (!email.endsWith('@ignitux.test')) return false;
  const prefixe = email.split('.')[0];
  return PREFIXES.includes(prefixe);
};

const aEffacer = tous.filter((u) => jetable(u.email));
const gardes = tous.filter((u) => !jetable(u.email));

console.log(`Comptes en base       : ${tous.length}`);
console.log(`À effacer             : ${aEffacer.length}`);
console.log(`Conservés             : ${gardes.length}\n`);

console.log('CONSERVÉS — chacun nommé, pour qu’aucun ne parte par surprise :');
for (const u of gardes) {
  const raison = INTOUCHABLES.some((m) => m.test(u.email))
    ? 'protégé explicitement'
    : !u.email.endsWith('@ignitux.test')
      ? 'compte réel'
      : 'préfixe inconnu — gardé par précaution';
  console.log(`  ${u.email.padEnd(40)} ${String(u._count.projects).padStart(2)} projet(s)  ${raison}`);
}

if (aEffacer.length === 0) {
  console.log('\nRien à effacer.');
  await prisma.$disconnect();
  process.exit(0);
}

const projetsEffaces = aEffacer.reduce((n, u) => n + u._count.projects, 0);
console.log(`\nÀ EFFACER : ${aEffacer.length} comptes et ${projetsEffaces} projets.`);

if (!APPLIQUER) {
  console.log('\nAperçu seulement. Relancer avec --appliquer pour effacer.');
  await prisma.$disconnect();
  process.exit(0);
}

let faits = 0;
for (const u of aEffacer) {
  // La même transaction que `deleteAccount`, sans le mot de passe : les
  // deux journaux sont anonymisés plutôt qu'effacés, la comptabilité part,
  // les investissements restent, et le reste cascade depuis `users`.
  const comptabilite = await ledgerDeletionOperations(prisma, u.id);
  const investissements = investorsDeletionOperations(prisma, u.id);
  await prisma.$transaction([
    prisma.constitution_violations.updateMany({ where: { user_id: u.id }, data: { user_id: null } }),
    prisma.ai_usage_events.updateMany({ where: { user_id: u.id }, data: { user_id: null } }),
    ...comptabilite,
    ...investissements,
    prisma.users.delete({ where: { id: u.id } }),
  ]);
  faits += 1;
  if (faits % 25 === 0) console.log(`  ${faits}/${aEffacer.length}…`);
}

const restants = await prisma.users.count();
console.log(`\n${faits} compte(s) effacé(s). Il en reste ${restants}.`);
console.log('Vérifier ensuite : node scripts/audit-financier.mjs');

await prisma.$disconnect();
