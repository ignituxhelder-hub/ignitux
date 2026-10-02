#!/usr/bin/env node
/**
 * DONNER UNE OFFRE À UN COMPTE — à la main, pour tester.
 *
 * Tant qu'aucun moyen de paiement n'est branché (`PAIEMENT_FOURNISSEUR`
 * reste "aucun"), personne ne peut passer en Entrepreneur ou Construction
 * depuis l'interface — `OffresService.changer()` le refuse explicitement
 * (voir offres.service.ts). Ce script contourne ça par une écriture directe
 * en base, réservée aux tests du fondateur sur son propre compte : jamais
 * un geste à proposer à une vraie personne.
 *
 *   node scripts/donner-offre.mjs email@exemple.fr entrepreneur
 *   node scripts/donner-offre.mjs email@exemple.fr entrepreneur --appliquer
 *
 * Mêmes garde-fous que migrer-prod.mjs : aperçu par défaut, cible affichée
 * avant d'écrire, refus sur la base `postgres` (développement).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const OFFRES_CONNUES = ['decouverte', 'entrepreneur', 'construction'];

const [, , email, offre, ...reste] = process.argv;
const APPLIQUER = reste.includes('--appliquer');
const fichierEnv = (() => {
  const i = reste.indexOf('--env');
  return i >= 0 && reste[i + 1] ? reste[i + 1] : '.env.production';
})();

if (!email || !offre) {
  console.error('Usage : node scripts/donner-offre.mjs <email> <decouverte|entrepreneur|construction> [--appliquer]');
  process.exit(1);
}
if (!OFFRES_CONNUES.includes(offre)) {
  console.error(`Offre inconnue : « ${offre} ». Attendu : ${OFFRES_CONNUES.join(', ')}.`);
  process.exit(1);
}

let url;
try {
  const texte = readFileSync(fichierEnv, 'utf8');
  const trouve = texte.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!trouve) throw new Error(`DATABASE_URL absente de ${fichierEnv}`);
  url = trouve[1];
} catch (erreur) {
  console.error(erreur.message);
  process.exit(1);
}

const adresse = new URL(url);
const base = adresse.pathname.slice(1);

console.log('┌─ Offre manuelle ──────────────────────────────────────────');
console.log(`│ fichier : ${fichierEnv}`);
console.log(`│ hôte    : ${adresse.hostname}`);
console.log(`│ base    : ${base}`);
console.log(`│ compte  : ${email}`);
console.log(`│ offre   : ${offre}`);
console.log(`│ mode    : ${APPLIQUER ? 'APPLIQUER' : 'aperçu (rien ne sera écrit)'}`);
console.log('└───────────────────────────────────────────────────────────\n');

if (base === 'postgres') {
  console.error('ARRÊT. La cible est la base « postgres », celle du développement.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const utilisateur = await prisma.users.findUnique({ where: { email }, select: { id: true, email: true } });
if (!utilisateur) {
  console.error(`Aucun compte avec l'email ${email} sur cette base.`);
  await prisma.$disconnect();
  process.exit(1);
}

const existante = await prisma.subscriptions.findUnique({ where: { user_id: utilisateur.id } });
if (existante) {
  console.log(`Offre actuelle : « ${existante.offre} » (depuis le ${existante.started_on.toISOString().slice(0, 10)}).`);
} else {
  console.log('Aucune offre en base actuellement (repli sur Découverte, ou Entrepreneur en bêta).');
}

if (!APPLIQUER) {
  console.log('\nRelancer avec --appliquer pour écrire.');
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.subscriptions.upsert({
  where: { user_id: utilisateur.id },
  create: {
    user_id: utilisateur.id,
    offre,
    started_on: new Date(),
    ends_on: null,
    provider: null,
    provider_ref: null,
  },
  update: {
    offre,
    started_on: new Date(),
    ends_on: null,
  },
});

console.log(`\nFait : ${email} est maintenant en offre « ${offre} ».`);
await prisma.$disconnect();
