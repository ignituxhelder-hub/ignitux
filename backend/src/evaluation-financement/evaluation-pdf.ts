import PDFDocument from 'pdfkit';
import { VERDICT_LABEL, type EvaluationReport } from './evaluation-model.js';

/**
 * LE DOSSIER DE FINANCEMENT — ce que l'entrepreneur envoie lui-même à une
 * banque ou à des investisseurs.
 *
 * La section Audit (ce qui manque) n'y figure jamais : elle sert à
 * l'entrepreneur pour corriger son dossier, pas au financeur pour le juger.
 */
export const PIED_DE_PAGE_PDF =
  'Évaluation indicative établie à partir des informations déclarées par le porteur. ' +
  'Elle ne constitue ni une offre ni une garantie de financement.';

export interface EntreeDossierPdf {
  titreProjet: string;
  descriptionProjet: string | null;
  rapport: EvaluationReport;
  noteIgnitux: string | null;
  valideLe: Date;
}

function formaterDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
}

function formaterMontant(euros: number): string {
  // Espace normale plutôt qu'insécable : pdfkit écrit en WinAnsi.
  return `${new Intl.NumberFormat('fr-FR').format(euros).replace(/\s/g, ' ')} €`;
}

export function genererDossierPdf(entree: EntreeDossierPdf): Promise<Buffer> {
  const { rapport } = entree;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const titre = (texte: string) => {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(13).text(texte);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(11);
    };

    // 1. Page de garde
    doc.moveDown(6);
    doc.font('Helvetica-Bold').fontSize(22).text('Dossier de financement', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(16).text(entree.titreProjet, { align: 'center' });
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Établi le ${formaterDate(entree.valideLe)}`, { align: 'center' });
    doc.text('Évaluation établie par Ignitux', { align: 'center' });

    // 2. Résumé et verdict
    doc.addPage();
    titre('Résumé');
    doc.font('Helvetica-Bold').text(`Verdict : ${VERDICT_LABEL[rapport.verdict]}`);
    doc.font('Helvetica').text(rapport.resume);
    if (entree.noteIgnitux) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Note d’Ignitux : ', { continued: true });
      doc.font('Helvetica').text(entree.noteIgnitux);
    }

    // 3. Présentation du projet et faisabilité
    titre('Présentation du projet');
    if (entree.descriptionProjet) doc.text(entree.descriptionProjet);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('Marché');
    doc.font('Helvetica').text(rapport.faisabilite.marche);
    doc.font('Helvetica-Bold').text('Modèle économique');
    doc.font('Helvetica').text(rapport.faisabilite.modeleEconomique);
    doc.font('Helvetica-Bold').text('Capacité de remboursement ou de rentabilité');
    doc.font('Helvetica').text(rapport.faisabilite.capacite);

    // 4. Besoin de financement
    titre('Besoin de financement');
    const montant = rapport.montantRecherche.montantEuros;
    doc.text(
      montant === null
        ? 'Montant recherché : non renseigné.'
        : `Montant recherché : ${formaterMontant(montant)} (source : ${rapport.montantRecherche.source})`,
    );
    doc.text(`Usage des fonds : ${rapport.usageDesFonds}`);
    if (rapport.pistes.length > 0) {
      doc.moveDown(0.3);
      doc.text('Pistes de financement (à titre d’information) :');
      for (const piste of rapport.pistes) {
        doc.text(`- ${piste.type} : ${piste.pourquoi}`, { indent: 15 });
      }
    }

    // 5. Risques
    titre('Risques et leur maîtrise');
    for (const r of rapport.risques) {
      doc.font('Helvetica-Bold').text(`${r.risque} (gravité ${r.gravite})`);
      doc.font('Helvetica').text(r.reduction, { indent: 15 });
    }

    // 6. Pièces
    titre('Pièces du dossier');
    for (const p of rapport.dossier) {
      doc.text(`[${p.etat === 'prete' ? 'Prête' : 'À fournir'}] ${p.piece}`);
    }

    // 7. Prochaines étapes
    titre('Prochaines étapes');
    rapport.prochainesEtapes.forEach((etape, i) => doc.text(`${i + 1}. ${etape}`));

    // Pied de page sur chaque page, sous la marge basse sans déclencher de saut.
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      const margeBasse = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .text(PIED_DE_PAGE_PDF, doc.page.margins.left, doc.page.height - 40, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'center',
        });
      doc.page.margins.bottom = margeBasse;
    }
    doc.end();
  });
}
