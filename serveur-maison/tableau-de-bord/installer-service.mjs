// ═══════════════════════════════════════════════════════════════════════════
// Installe le tableau de bord comme service Windows, démarré automatiquement
// — même principe que ../../pc-usage-tracker/server/src/windows-service/install.ts,
// éprouvé sur cette machine. Contrairement à ce dernier, pas d'étape de
// build : ce paquet est du JavaScript simple, servi directement.
//
// À lancer depuis une invite PowerShell VRAIMENT ouverte en administrateur :
//   cd serveur-maison/tableau-de-bord
//   npm install
//   npm run installer-service
// ═══════════════════════════════════════════════════════════════════════════

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Service } from 'node-windows';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const service = new Service({
  name: 'Ignitux - Tableau de bord',
  description: 'Petit tableau de bord local du serveur maison Ignitux (version déployée, conteneurs Docker, CPU, RAM).',
  script: path.join(__dirname, 'serveur.mjs'),
});

service.on('install', () => {
  console.log('Service installé. Démarrage…');
  service.start();
});

service.on('alreadyinstalled', () => {
  console.log('Le service est déjà installé.');
});

service.on('start', () => {
  console.log('Service démarré — il redémarrera automatiquement avec Windows.');
});

service.on('error', (erreur) => {
  console.error("Échec de l'installation du service :", erreur);
});

service.install();
