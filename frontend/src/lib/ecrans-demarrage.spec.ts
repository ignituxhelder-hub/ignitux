import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ECRANS_DEMARRAGE, fichierDemarrage, imagesDemarrage } from './ecrans-demarrage';

const PUBLIC = path.resolve(__dirname, '../../public');

describe('écrans de démarrage iOS', () => {
  // Une image annoncée mais absente, et l'iPhone concerné s'ouvre sur du
  // blanc sans que rien ne le signale. Relancer scripts/generer-images-app.mjs.
  it('chaque image annoncée existe dans public/', () => {
    const manquantes = ECRANS_DEMARRAGE.map(fichierDemarrage).filter(
      (url) => !existsSync(path.join(PUBLIC, url)),
    );
    expect(manquantes).toEqual([]);
  });

  it('un écran par combinaison taille × densité, jamais deux fois le même', () => {
    const cles = ECRANS_DEMARRAGE.map((e) => `${e.largeur}x${e.hauteur}@${e.ratio}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('décrit l’appareil comme iOS le lit', () => {
    const [premiere] = imagesDemarrage();
    expect(premiere.media).toMatch(
      /^\(device-width: \d+px\) and \(device-height: \d+px\) and \(-webkit-device-pixel-ratio: \d\) and \(orientation: portrait\)$/,
    );
  });
});
