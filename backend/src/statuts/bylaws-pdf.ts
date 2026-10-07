import PDFDocument from 'pdfkit';

export const MARQUEUR_BROUILLON = 'Brouillon — à relire avant tout dépôt';

/**
 * Génère le PDF à la volée, jamais stocké : le texte en base reste la seule
 * source de vérité (voir la spec). `pdfkit` écrit par flux ; on collecte les
 * morceaux en mémoire plutôt que d'écrire sur disque, un document de
 * statuts reste de taille modeste.
 *
 * Un PDF se détache de l'interface : pour un brouillon, le marqueur voyage
 * avec le fichier, afin qu'il ne soit jamais pris pour un document prêt à
 * déposer sans relecture.
 */
export function genererPdfStatuts(content: string, options: { brouillon: boolean }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (options.brouillon) {
      doc.font('Helvetica-Bold').fontSize(14).text(MARQUEUR_BROUILLON, { align: 'left' });
      doc.moveDown(1.5);
    }
    doc.font('Helvetica').fontSize(12).text(content, { align: 'left' });
    doc.end();
  });
}
