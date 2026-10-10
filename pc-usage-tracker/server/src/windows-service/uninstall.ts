import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- node-windows n'expose pas de types ESM.
const { Service } = require('node-windows');

const svc = new Service({
  name: 'IGNITUX PC Usage Tracker',
  script: path.join(__dirname, '..', '..', 'dist', 'index.js'),
});

svc.on('uninstall', () => {
  console.log('Service désinstallé.');
});

svc.on('error', (error: unknown) => {
  console.error('Échec de la désinstallation du service :', error);
});

svc.uninstall();
