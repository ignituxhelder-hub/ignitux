import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { genererPdfDossier, formaterEuros, type DonneesRecapitulatif } from './dossier-pdf.js';
import { fraisPourForme } from './guide.js';
import { calculerPieces } from './pieces.js';

/** Octets WinAnsi (hex) des chaînes écrites par pdfkit dans les flux décompressés. */
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

const donnees = (surcharge: Partial<DonneesRecapitulatif> = {}): DonneesRecapitulatif => ({
  projetTitre: 'Ma boulangerie',
  forme: 'SASU',
  statuts: null,
  pieces: calculerPieces({ forme: 'SASU', statuts: null, identites: [], mandatActifSigne: false, piecesCochees: [] }),
  frais: fraisPourForme('SASU'),
  depot: { status: 'preparation', depositedAt: null, filingReference: null },
  ...surcharge,
});

describe('genererPdfDossier', () => {
  it('se génère sans statuts ni identité', async () => {
    const buffer = await genererPdfDossier(donnees());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(octetsTexte(buffer)).toContain(hex('Pas encore de statuts'));
  });

  it('se génère sans forme confirmée', async () => {
    const buffer = await genererPdfDossier(
      donnees({
        forme: null,
        pieces: calculerPieces({ forme: null, statuts: null, identites: [], mandatActifSigne: false, piecesCochees: [] }),
        frais: fraisPourForme(null),
      }),
    );
    expect(octetsTexte(buffer)).toContain(hex('non confirm'));
  });

  it('reprend siège, capital et associés depuis les statuts', async () => {
    const buffer = await genererPdfDossier(
      donnees({
        statuts: {
          headOffice: '1 rue de la Paix, 75002 Paris',
          capitalCents: 150000,
          associes: [{ fullName: 'Alice Martin', shareBasisPoints: 10000 }],
        },
      }),
    );
    const texte = octetsTexte(buffer);
    expect(texte).toContain(hex('1 rue de la Paix'));
    expect(texte).toContain(hex('1 500,00'));
    expect(texte).toContain(hex('Alice Martin'));
  });

  it('affiche l’état de chaque pièce en texte', async () => {
    const texte = octetsTexte(await genererPdfDossier(donnees()));
    expect(texte).toContain(hex('[Prêt]'));
    expect(texte).toContain(hex('[À faire]'));
  });

  it('porte les frais indicatifs datés et le renvoi aux sites officiels', async () => {
    const texte = octetsTexte(await genererPdfDossier(donnees()));
    expect(texte).toContain(hex('octobre 2026'));
    expect(texte).toContain(hex('les montants sur les sites officiels'));
  });

  it('porte l’avertissement « pas un conseil juridique » sur chaque page', async () => {
    const pieces = Array.from({ length: 80 }, () => calculerPieces({ forme: 'SAS', statuts: null, identites: [], mandatActifSigne: false, piecesCochees: [] })).flat();
    const buffer = await genererPdfDossier(donnees({ pieces }));
    const pages = buffer.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? [];
    const occurrences = octetsTexte(buffer).split(hex('pas un conseil juridique')).length - 1;
    expect(pages.length).toBeGreaterThan(1);
    expect(occurrences).toBe(pages.length);
  });

  it('mentionne le dépôt et sa référence quand le dossier est marqué déposé', async () => {
    const texte = octetsTexte(
      await genererPdfDossier(
        donnees({ depot: { status: 'depose', depositedAt: new Date('2026-10-08T10:00:00Z'), filingReference: 'J00123' } }),
      ),
    );
    expect(texte).toContain(hex('08/10/2026'));
    expect(texte).toContain(hex('J00123'));
  });
});

describe('formaterEuros', () => {
  it('sépare les milliers et utilise la virgule', () => {
    expect(formaterEuros(123456789)).toBe('1 234 567,89 €');
    expect(formaterEuros(100)).toBe('1,00 €');
  });
});
