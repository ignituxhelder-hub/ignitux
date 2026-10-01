import { createWorker } from 'tesseract.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Répertoire du modèle de langue français vendorisé dans le dépôt (voir
 * `tessdata/fra.traineddata`, suivi par git). Résolu par rapport à ce
 * fichier lui-même — et non au répertoire courant du process — pour
 * fonctionner à l'identique en développement (`src/identite/`) et une fois
 * compilé (`dist/identite/`, seul répertoire embarqué en production : voir
 * le Dockerfile).
 */
const tessdataDir = join(dirname(fileURLToPath(import.meta.url)), 'tessdata');

/**
 * OCR local, sans aucun appel réseau, y compris au tout premier démarrage :
 * par défaut `tesseract.js` télécharge son modèle de langue depuis le CDN
 * jsdelivr si rien n'est déjà en cache sur disque, ce qui romprait
 * silencieusement (ou échouerait) dans un environnement de déploiement
 * sans accès sortant ou sans disque persistant. Le modèle est donc
 * vendorisé dans le dépôt et chargé exclusivement depuis ce fichier :
 * `cachePath` le fait trouver dès la vérification de cache (le chemin de
 * code qui contacterait le CDN n'est même pas atteint — voir
 * `node_modules/tesseract.js/src/worker-script/index.js`, fonction
 * `loadAndGunzipFile`), et `langPath` répète le même répertoire local en
 * secours si jamais cette lecture de cache échouait, afin qu'aucun chemin
 * de code ne puisse retomber sur le réseau. `cacheMethod: 'readOnly'`
 * évite aussi toute tentative d'écriture sur un système de fichiers de
 * production potentiellement en lecture seule. Aucun document envoyé à un
 * tiers — condition posée par la spec (v1 gratuite).
 */
export async function extraireTexte(image: Buffer): Promise<string> {
  const worker = await createWorker('fra', undefined, {
    cachePath: tessdataDir,
    langPath: tessdataDir,
    cacheMethod: 'readOnly',
    gzip: false,
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(image);
    return text;
  } finally {
    await worker.terminate();
  }
}
