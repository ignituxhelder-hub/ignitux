#!/usr/bin/env node
/**
 * TEST DE CHARGE LOCAL — point 13 de docs/reste-a-faire.md.
 *
 * ## Ce que ce script est, et ce qu'il n'est pas
 *
 * Il ne mesure pas « la capacité de production ». Une machine de
 * développement, une base locale et une machine de production n'ont rien
 * en commun niveau performance — ce script répond seulement à une question
 * plus modeste : est-ce qu'une route se comporte raisonnablement sous
 * plusieurs requêtes concurrentes, ou s'effondre-t-elle (erreurs, latence
 * qui explose) dès qu'on la sollicite un peu ? Utile pour repérer une
 * régression avant qu'elle n'atteigne qui que ce soit.
 *
 * ## Sécurité : jamais contre un serveur distant
 *
 * Le script refuse de démarrer si `--url` ne pointe pas vers localhost ou
 * 127.0.0.1. Un test de charge est, par construction, une rafale de
 * requêtes répétées ; lancée par erreur contre la production, elle en est
 * indiscernable d'une petite attaque par déni de service contre son propre
 * service.
 *
 * ## Usage
 *
 *   node scripts/charge.mjs                              → /health, 10 connexions, 10 s
 *   node scripts/charge.mjs --url http://localhost:3000/health
 *   node scripts/charge.mjs --connexions 50 --duree 20
 *
 * Démarrer le serveur cible séparément avant d'exécuter ce script
 * (`npm run start:dev`, sur un port qui n'est pas déjà utilisé par ailleurs).
 */
import autocannon from 'autocannon';

function argument(nom, defaut) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const url = argument('--url', 'http://localhost:3000/health');
const connexions = Number(argument('--connexions', '10'));
const duree = Number(argument('--duree', '10'));

function estLocal(urlCible) {
  const hote = new URL(urlCible).hostname;
  return hote === 'localhost' || hote === '127.0.0.1' || hote === '::1';
}

if (!estLocal(url)) {
  console.error(
    `Refus de lancer un test de charge contre "${url}" : ce n'est pas une adresse locale. ` +
      'Ce script ne doit jamais viser un serveur distant, encore moins la production.',
  );
  process.exit(1);
}

console.log(`Test de charge : ${url} (${connexions} connexions, ${duree} s)…`);

const resultat = await autocannon({
  url,
  connections: connexions,
  duration: duree,
});

const { requests, latency, errors, timeouts, non2xx } = resultat;

console.log('');
console.log(`Requêtes/s        : moyenne ${requests.average}, min ${requests.min}, max ${requests.max}`);
console.log(`Latence (ms)      : moyenne ${latency.average}, p50 ${latency.p50}, p99 ${latency.p99}`);
console.log(`Total de requêtes : ${requests.total}`);
console.log(`Erreurs           : ${errors}`);
console.log(`Délais dépassés   : ${timeouts}`);
console.log(`Réponses non-2xx  : ${non2xx}`);

if (errors > 0 || timeouts > 0) {
  console.error('');
  console.error('Des requêtes ont échoué ou expiré — voir le détail ci-dessus.');
  process.exit(1);
}
