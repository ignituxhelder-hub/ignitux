import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { genererDossierPdf, PIED_DE_PAGE_PDF } from './evaluation-pdf.js';
import { rapport } from './evaluation.fixture.js';
import type { EvaluationReport } from './evaluation-model.js';

/** Octets WinAnsi (hex) des chaînes écrites par pdfkit — même méthode que dossier-pdf.spec.ts. */
function octetsTexte(b: Buffer): string {
  let out = '';
  let decompresses = 0;
  for (const m of b.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const texte = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      out += [...texte.matchAll(/<([0-9a-f]+)>/g)].map((x) => x[1]).join('');
      decompresses++;
    } catch {
      // flux non Flate : ignoré
    }
  }
  if (decompresses === 0) {
    throw new Error('Aucun flux du PDF n’a pu être décompressé : le test ne vérifierait rien.');
  }
  return out;
}
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex');

const entree = (partiel: Partial<EvaluationReport> = {}) => ({
  titreProjet: 'Ma boulangerie',
  descriptionProjet: 'Pain au levain dans le 11e.',
  rapport: rapport(partiel),
  noteIgnitux: 'Dossier sérieux, à compléter.',
  valideLe: new Date('2026-10-11T10:00:00Z'),
});

describe('genererDossierPdf', () => {
  it('produit un PDF', async () => {
    const buffer = await genererDossierPdf(entree());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('contient la page de garde, le verdict, la note et le pied de page', async () => {
    const texte = octetsTexte(await genererDossierPdf(entree()));
    expect(texte).toContain(hex('Dossier de financement'));
    expect(texte).toContain(hex('Finançable après corrections'));
    expect(texte).toContain(hex('Dossier sérieux, à compléter.'));
    expect(texte).toContain(hex('ni une offre ni une garantie de financement'));
    expect(PIED_DE_PAGE_PDF).toBe(
      'Évaluation indicative établie à partir des informations déclarées par le porteur. ' +
        'Elle ne constitue ni une offre ni une garantie de financement.',
    );
  });

  it('reprend les risques et les pièces', async () => {
    const texte = octetsTexte(await genererDossierPdf(entree()));
    expect(texte).toContain(hex('Loyer élevé'));
    expect(texte).toContain(hex('Plan de financement'));
  });

  it('ne contient jamais la section Audit', async () => {
    const texte = octetsTexte(
      await genererDossierPdf(entree({ audit: { connu: ['CONNU-SECRET'], manques: ['MANQUE-SECRET'] } })),
    );
    expect(texte).not.toContain(hex('MANQUE-SECRET'));
    expect(texte).not.toContain(hex('CONNU-SECRET'));
    expect(texte).not.toContain(hex('Audit'));
  });
});
