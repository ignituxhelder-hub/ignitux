import { describe, expect, it } from 'vitest';
import { extraireTexte } from './ocr-extraction.js';

// Ce test ne vérifie pas la précision de l'OCR sur une vraie pièce
// d'identité (impossible sans fixture réelle et hors de portée d'un test
// unitaire) : il vérifie que le pipeline tourne de bout en bout sur une
// image synthétique et rend une chaîne, ce qui suffit à garantir que
// l'intégration tesseract.js fonctionne dans cet environnement.
describe('extraireTexte', () => {
  it('retourne une chaîne (éventuellement vide) sans lever d’exception', async () => {
    // 1x1 PNG blanc — aucun texte à reconnaître, mais le pipeline doit
    // tourner sans erreur et rendre une chaîne.
    const pngBlanc = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const texte = await extraireTexte(pngBlanc);
    expect(typeof texte).toBe('string');
  }, 30000);
});
