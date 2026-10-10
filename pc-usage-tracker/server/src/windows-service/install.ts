import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- node-windows n'expose pas de types ESM.
const { Service } = require('node-windows');

/**
 * Installe le tracker comme service Windows, démarré automatiquement au
 * boot — l'objectif même du projet : ne dépendre de personne pour relancer
 * le compteur après un redémarrage du PC. Doit être lancé depuis une invite
 * PowerShell **exécutée en administrateur**, et après `npm run build`
 * (le service exécute le JavaScript compilé dans dist/, pas les sources
 * TypeScript).
 */
const svc = new Service({
  name: 'IGNITUX PC Usage Tracker',
  description:
    "Comptabilise le temps d'utilisation du PC par IGNITUX et calcule le montant dû à son propriétaire.",
  script: path.join(__dirname, '..', '..', 'dist', 'index.js'),
});

svc.on('install', () => {
  console.log('Service installé. Démarrage...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Le service est déjà installé.');
});

svc.on('start', () => {
  console.log('Service démarré — il redémarrera automatiquement avec Windows.');
});

svc.on('error', (error: unknown) => {
  console.error("Échec de l'installation du service :", error);
});

svc.install();
