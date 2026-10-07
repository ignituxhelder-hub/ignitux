import PDFDocument from 'pdfkit';

export const MARQUEUR_BROUILLON = 'Brouillon — à relire avant tout dépôt';

/**
 * Pied de page d'une version retenue. « Retenue » veut dire « choisie par la
 * personne », pas « validée juridiquement » : le fichier quitte l'interface,
 * l'avertissement doit voyager avec lui, sur chaque page.
 */
export const AVERTISSEMENT_JURIDIQUE =
  'Texte généré par IA. Retenir cette version n’est pas une validation juridique : ' +
  'faites-la relire par un professionnel (avocat, expert-comptable) avant tout dépôt.';

/**
 * Génère le PDF à la volée, jamais stocké : le texte en base reste la seule
 * source de vérité (voir la spec). `pdfkit` écrit par flux ; on collecte les
 * morceaux en mémoire plutôt que d'écrire sur disque, un document de
 * statuts reste de taille modeste.
 *
 * Un PDF se détache de l'interface : pour un brouillon, le marqueur voyage
 * avec le fichier, afin qu'il ne soit jamais pris pour un document prêt à
 * déposer sans relecture ; pour une version retenue, c'est l'avertissement
 * juridique en pied de page.
 */
export function genererPdfStatuts(content: string, options: { brouillon: boolean }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // bufferPages : le pied de page s'écrit sur chaque page une fois la
    // pagination connue.
    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (options.brouillon) {
      doc.font('Helvetica-Bold').fontSize(14).text(MARQUEUR_BROUILLON, { align: 'left' });
      doc.moveDown(1.5);
    }
    doc.font('Helvetica').fontSize(12).text(content, { align: 'left' });

    if (!options.brouillon) {
      const { start, count } = doc.bufferedPageRange();
      for (let i = start; i < start + count; i++) {
        doc.switchToPage(i);
        // Écrire sous la marge basse déclencherait un saut de page : on la
        // lève le temps du pied de page.
        const margeBasse = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font('Helvetica')
          .fontSize(8)
          .text(AVERTISSEMENT_JURIDIQUE, doc.page.margins.left, doc.page.height - 40, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: 'center',
          });
        doc.page.margins.bottom = margeBasse;
      }
    }
    doc.end();
  });
}
