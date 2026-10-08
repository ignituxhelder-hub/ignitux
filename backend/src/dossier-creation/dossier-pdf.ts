import PDFDocument from 'pdfkit';
import type { Frais } from './guide.js';
import { familleDeForme, type EtatPiece, type Piece } from './pieces.js';

/** Voyage avec le fichier, sur chaque page : le PDF se détache de l'interface. */
export const AVERTISSEMENT_DOSSIER =
  'Document d’aide à la préparation, pas un conseil juridique. ' +
  'Ignitux ne dépose rien et ne paie rien : c’est toi qui déposes ton dossier sur le guichet unique.';

export const LIBELLES_ETAT: Record<EtatPiece, string> = {
  pret: 'Prêt',
  a_faire: 'À faire',
  non_concerne: 'Non concerné',
};

export interface DonneesRecapitulatif {
  projetTitre: string;
  forme: string | null;
  /** Depuis les statuts du projet s'ils existent ; null sinon. */
  statuts: {
    headOffice: string;
    capitalCents: number;
    associes: { fullName: string; shareBasisPoints: number }[];
  } | null;
  pieces: Piece[];
  frais: Frais;
  depot: { status: string; depositedAt: Date | null; filingReference: string | null };
}

/** « 1 234,50 € » sans espace insécable fine (hors WinAnsi, mal rendue par pdfkit). */
export function formaterEuros(cents: number): string {
  const [entier, decimales] = (cents / 100).toFixed(2).split('.');
  return `${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimales} €`;
}

function formaterPourcentage(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2).replace('.', ',')} %`;
}

/**
 * Jour du dépôt à l'heure de Paris, « jj/mm/aaaa » : le même jour que celui
 * affiché par l'interface (qui formate aussi en Europe/Paris), même pour un
 * dépôt marqué entre minuit et 2 h, heure française.
 */
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formaterDate(date: Date): string {
  return FORMAT_JOUR_PARIS.format(date);
}

/**
 * Récapitulatif du dossier de création, généré à la volée et jamais stocké
 * (même règles que le PDF des statuts : tampon mémoire, pas de disque).
 * Doit se générer même sans statuts ni identité vérifiée.
 */
export function genererPdfDossier(donnees: DonneesRecapitulatif): Promise<Buffer> {
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

    doc.font('Helvetica-Bold').fontSize(16).text('Récapitulatif du dossier de création');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Projet : ${donnees.projetTitre}`);
    doc.text(`Forme juridique : ${donnees.forme ?? 'non confirmée'}`);

    // Micro-entreprise / EI : pas de société, donc ni section « Société » ni
    // statuts — même s'il en reste d'une forme précédente.
    if (familleDeForme(donnees.forme) !== 'individuelle') {
      ecrireSociete();
    }

    function ecrireSociete() {
      titre('Société');
      if (!donnees.statuts) {
        doc.text('Pas encore de statuts : siège, capital et associés seront repris ici une fois les statuts générés.');
        return;
      }
      doc.text(`Siège : ${donnees.statuts.headOffice}`);
      doc.text(`Capital : ${formaterEuros(donnees.statuts.capitalCents)}`);
      if (donnees.statuts.associes.length > 0) {
        doc.text('Associés :');
        for (const associe of donnees.statuts.associes) {
          doc.text(`- ${associe.fullName} : ${formaterPourcentage(associe.shareBasisPoints)}`, { indent: 15 });
        }
      }
    }

    titre('Pièces du dossier');
    for (const piece of donnees.pieces) {
      doc.font('Helvetica-Bold').text(`[${LIBELLES_ETAT[piece.etat]}] `, { continued: true });
      doc.font('Helvetica').text(piece.titre);
      doc.fontSize(9).text(piece.detail, { indent: 15 });
      doc.fontSize(11);
    }

    titre('Dépôt');
    if (donnees.depot.status === 'depose') {
      const date = donnees.depot.depositedAt ? ` le ${formaterDate(donnees.depot.depositedAt)}` : '';
      doc.text(`Marqué comme déposé${date}.`);
      if (donnees.depot.filingReference) {
        doc.text(`Référence : ${donnees.depot.filingReference}`);
      }
    } else {
      doc.text('En préparation : le dossier n’est pas encore marqué comme déposé.');
    }

    titre(`Frais à prévoir (indicatif, ${donnees.frais.miseAJour})`);
    for (const ligne of donnees.frais.lignes) {
      doc.text(`- ${ligne}`);
    }
    doc.moveDown(0.3);
    doc.fontSize(9).text(donnees.frais.avertissement);
    for (const source of donnees.frais.sources) {
      doc.text(`${source.libelle} : ${source.url}`);
    }

    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      // Écrire sous la marge basse déclencherait un saut de page.
      const margeBasse = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .text(AVERTISSEMENT_DOSSIER, doc.page.margins.left, doc.page.height - 40, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'center',
        });
      doc.page.margins.bottom = margeBasse;
    }
    doc.end();
  });
}
