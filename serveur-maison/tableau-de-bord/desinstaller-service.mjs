// Retire le service Windows installé par installer-service.mjs.
// À lancer en administrateur : npm run desinstaller-service

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Service } from 'node-windows';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const service = new Service({
  name: 'Ignitux - Tableau de bord',
  script: path.join(__dirname, 'serveur.mjs'),
});

service.on('uninstall', () => {
  console.log('Service désinstallé.');
});

service.on('error', (erreur) => {
  console.error('Échec de la désinstallation :', erreur);
});

service.uninstall();
