import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { genererPdfStatuts } from './bylaws-pdf.js';

const entete = (b: Buffer) => b.subarray(0, 5).toString('ascii');
const FINAL = { brouillon: false };

/** Contenu décompressé de tous les flux du PDF, en latin1 (1 octet = 1 caractère). */
function flux(b: Buffer): string {
  let out = '';
  for (const m of b.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      out += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') + '\n';
    } catch {
      // flux non compressé ou non Flate : ignoré
    }
  }
  return out;
}

/** Les chaînes hexadécimales (<...>) écrites par pdfkit, concaténées en octets WinAnsi. */
function octetsTexte(b: Buffer): string {
  return [...flux(b).matchAll(/<([0-9a-f]+)>/g)].map((m) => m[1]).join('');
}

describe('genererPdfStatuts', () => {
  it('produit un buffer commençant par l’en-tête PDF', async () => {
    const buffer = await genererPdfStatuts('Article 1 — Forme\n\nLa société est...', FINAL);
    expect(entete(buffer)).toBe('%PDF-');
  });

  it('gère un texte vide sans lever d’exception', async () => {
    await expect(genererPdfStatuts('', FINAL)).resolves.toBeInstanceOf(Buffer);
  });

  it('encode les caractères français en WinAnsi (« » œ € — é)', async () => {
    const buffer = await genererPdfStatuts('«œ»€—é', FINAL);
    // WinAnsi : « ab, œ 9c, » bb, € 80, — 97, é e9
    expect(octetsTexte(buffer)).toContain('ab9cbb8097e9');
  });

  it('ne plante pas sur du texte hors WinAnsi (emoji, cyrillique, chinois)', async () => {
    const buffer = await genererPdfStatuts('Emoji 😀 — д — 中', FINAL);
    expect(entete(buffer)).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('pagine automatiquement un long document', async () => {
    const court = await genererPdfStatuts('Article 1 — Forme', FINAL);
    const ligne = 'La société est une société par actions simplifiée régie par la loi.';
    const long = await genererPdfStatuts(Array.from({ length: 300 }, () => ligne).join('\n'), FINAL);
    expect(entete(long)).toBe('%PDF-');
    expect(long.length).toBeGreaterThan(court.length * 2);
    const pages = long.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? [];
    expect(pages.length).toBeGreaterThan(3);
  });

  describe('marqueur de brouillon', () => {
    // « Brouillon — à relire avant tout dépôt » en WinAnsi : — 97, à e0, é e9, ô f4
    const MARQUEUR_HEX = '42726f75696c6c6f6e20' + '9720e0'; // « Brouillon — à

    it('est présent pour un brouillon, en gras, avant le corps', async () => {
      const buffer = await genererPdfStatuts('Corps du texte', { brouillon: true });
      const texte = octetsTexte(buffer);
      expect(texte).toContain(MARQUEUR_HEX);
      expect(texte).toContain('64e970f474'); // dépôt
      expect(buffer.toString('latin1')).toContain('Helvetica-Bold');
      expect(texte.indexOf(MARQUEUR_HEX)).toBeLessThan(texte.indexOf('436f727073')); // Corps
    });

    it('est absent hors brouillon', async () => {
      const buffer = await genererPdfStatuts('Corps du texte', FINAL);
      expect(octetsTexte(buffer)).not.toContain('42726f75696c6c6f6e');
      expect(buffer.toString('latin1')).not.toContain('Helvetica-Bold');
    });
  });
});
