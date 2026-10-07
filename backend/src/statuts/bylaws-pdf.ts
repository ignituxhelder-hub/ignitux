import PDFDocument from 'pdfkit';

/**
 * Génère le PDF à la volée, jamais stocké : le texte en base reste la seule
 * source de vérité (voir la spec). `pdfkit` écrit par flux ; on collecte les
 * morceaux en mémoire plutôt que d'écrire sur disque, un document de
 * statuts reste de taille modeste.
 */
export function genererPdfStatuts(content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(12).text(content, { align: 'left' });
    doc.end();
  });
}
