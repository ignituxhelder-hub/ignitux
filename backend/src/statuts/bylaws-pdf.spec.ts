import { describe, expect, it } from 'vitest';
import { genererPdfStatuts } from './bylaws-pdf.js';

const entete = (b: Buffer) => b.subarray(0, 5).toString('ascii');

describe('genererPdfStatuts', () => {
  it('produit un buffer commençant par l’en-tête PDF', async () => {
    const buffer = await genererPdfStatuts('Article 1 — Forme\n\nLa société est...');
    expect(entete(buffer)).toBe('%PDF-');
  });

  it('gère un texte vide sans lever d’exception', async () => {
    await expect(genererPdfStatuts('')).resolves.toBeInstanceOf(Buffer);
  });

  it('gère les caractères français (accents, œ, « », €, tiret cadratin)', async () => {
    const texte =
      'Article 2 — Objet\n« La société a pour objet… » é è ç à ê ô î û œ Œ æ ’ – — € 1 000 €.';
    const buffer = await genererPdfStatuts(texte);
    expect(entete(buffer)).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('pagine automatiquement un long document', async () => {
    const court = await genererPdfStatuts('Article 1 — Forme');
    const ligne = 'La société est une société par actions simplifiée régie par la loi.';
    const long = await genererPdfStatuts(Array.from({ length: 300 }, () => ligne).join('\n'));
    expect(entete(long)).toBe('%PDF-');
    expect(long.length).toBeGreaterThan(court.length * 2);
    // Au moins plusieurs pages : chaque page est un objet /Type /Page.
    const pages = long.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? [];
    expect(pages.length).toBeGreaterThan(3);
  });
});
