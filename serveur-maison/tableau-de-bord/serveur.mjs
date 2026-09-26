// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD — un serveur HTTP minimal, sans framework ni étape de
// build : `node serveur.mjs` suffit. Sert une page qui interroge
// /api/etat toutes les 10 secondes.
//
// Docker et les ressources système sont lus avec les mêmes bibliothèques
// que pc-usage-tracker (../../pc-usage-tracker/server/src/docker/dockerMonitor.ts
// et .../resourceMonitor.ts) — même méthode déjà éprouvée sur cette machine,
// pas de nouvelle façon de faire la même chose.
//
// Aucune authentification : ce tableau de bord n'est accessible que depuis
// le tailnet (voir ../pare-feu.ps1) et n'affiche que de l'état, jamais de
// donnée métier. Si le tailnet accueille un jour plus d'une personne, ça
// vaudra la peine d'y revenir.
// ═══════════════════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Docker from 'dockerode';
import si from 'systeminformation';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_DEPOT = path.resolve(__dirname, '..', '..');
const FICHIER_ETAT = path.join(__dirname, '..', 'journaux', 'etat.json');
const PORT = Number(process.env.PORT ?? 3210);

const docker = new Docker();

function executerGit(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: RACINE_DEPOT, timeout: 5000 }, (erreur, stdout) => {
      resolve(erreur ? null : stdout.trim());
    });
  });
}

async function lireDepotActuel() {
  const [version, message, auteur, date] = await Promise.all([
    executerGit(['describe', '--tags', '--always']),
    executerGit(['log', '-1', '--format=%s']),
    executerGit(['log', '-1', '--format=%an']),
    executerGit(['log', '-1', '--format=%cI']),
  ]);
  return { version, message, auteur, date };
}

async function lireDerniereMaj() {
  try {
    const contenu = await readFile(FICHIER_ETAT, 'utf8');
    return JSON.parse(contenu);
  } catch {
    return null;
  }
}

async function lireConteneurs() {
  try {
    const conteneurs = await docker.listContainers({ all: true });
    return conteneurs
      .filter((conteneur) => conteneur.Names.some((nom) => nom.includes('ignitux')))
      .map((conteneur) => ({
        nom: conteneur.Names[0]?.replace(/^\//, '') ?? conteneur.Id.slice(0, 12),
        etat: conteneur.State,
        statut: conteneur.Status,
      }));
  } catch (erreur) {
    return { erreur: "Docker inaccessible : " + erreur.message };
  }
}

async function lireRessources() {
  const [charge, memoire] = await Promise.all([si.currentLoad(), si.mem()]);
  return {
    cpuPourcent: Math.round(charge.currentLoad * 10) / 10,
    ramUtiliseeMo: Math.round(memoire.active / (1024 * 1024)),
    ramTotaleMo: Math.round(memoire.total / (1024 * 1024)),
  };
}

async function construireEtat() {
  const [depot, derniereMaj, conteneurs, ressources] = await Promise.all([
    lireDepotActuel(),
    lireDerniereMaj(),
    lireConteneurs(),
    lireRessources(),
  ]);
  return { depot, derniereMaj, conteneurs, ressources, horodatage: new Date().toISOString() };
}

const PAGE_INDEX = await readFile(path.join(__dirname, 'public', 'index.html'));

const serveur = createServer(async (requete, reponse) => {
  if (requete.url === '/api/etat') {
    try {
      const etat = await construireEtat();
      reponse.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify(etat));
    } catch (erreur) {
      reponse.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify({ erreur: erreur.message }));
    }
    return;
  }

  reponse.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  reponse.end(PAGE_INDEX);
});

serveur.listen(PORT, '0.0.0.0', () => {
  console.log(`Tableau de bord Ignitux sur http://0.0.0.0:${PORT}`);
});
