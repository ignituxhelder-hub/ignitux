import { validerChecksumMrz } from './mrz-checksum.js';

export interface ChampsExtraits {
  mrzValide: boolean | null;
  dateNaissance?: Date;
  dateExpiration?: Date;
  numeroDocument?: string;
}

/**
 * Complète une année à deux chiffres MRZ en année complète : si les deux
 * chiffres dépassent l'année courante à deux chiffres, on suppose le
 * siècle précédent (une naissance ne peut pas être dans le futur), sinon
 * le siècle courant. Même heuristique pour la date d'expiration — une
 * pièce réelle n'expire jamais assez loin dans le passé pour que ça pose
 * problème avant longtemps.
 */
function anneeComplete(yy: number, anneeReference: number): number {
  const siecleCourant = Math.floor(anneeReference / 100) * 100;
  const anneeCourante2Chiffres = anneeReference % 100;
  return yy > anneeCourante2Chiffres ? siecleCourant - 100 + yy : siecleCourant + yy;
}

function dateDepuisMrz(yymmdd: string, anneeReference: number): Date | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const annee = anneeComplete(Number(yymmdd.slice(0, 2)), anneeReference);
  const mois = Number(yymmdd.slice(2, 4));
  const jour = Number(yymmdd.slice(4, 6));
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/**
 * Isole les lignes qui ressemblent à de la MRZ (30 ou 44 caractères,
 * alphabet MRZ strict) dans le texte brut rendu par l'OCR, valide leur
 * checksum, et pour une ligne TD3 (passeport) en extrait aussi le numéro
 * de document et les deux dates — nécessaires au rejet automatique des
 * documents expirés (voir IdentiteService.soumettreDocument).
 *
 * `prenom`/`nom` structurés ne sont volontairement pas extraits ici : le
 * format du nom en ligne 1 a ses propres règles de troncature, non
 * nécessaires puisque la cohérence du nom (voir IdentiteService) compare
 * directement le texte OCR brut, sans passer par un champ structuré.
 *
 * TD1 (carte d'identité) n'est pas encore couvert, même limite que pour
 * `validerChecksumMrz` — voir sa documentation.
 */
export function extraireChampsStructures(
  texteOcr: string,
  maintenant: Date = new Date(),
): ChampsExtraits {
  const lignesMrz = texteOcr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => (l.length === 30 || l.length === 44) && /^[A-Z0-9<]+$/.test(l));

  const mrzValide = validerChecksumMrz(lignesMrz);
  const ligneTd3 = lignesMrz.find((l) => l.length === 44);
  if (!ligneTd3) {
    return { mrzValide };
  }

  const anneeReference = maintenant.getUTCFullYear();
  return {
    mrzValide,
    numeroDocument: ligneTd3.slice(0, 9).replace(/</g, ''),
    dateNaissance: dateDepuisMrz(ligneTd3.slice(13, 19), anneeReference),
    dateExpiration: dateDepuisMrz(ligneTd3.slice(21, 27), anneeReference),
  };
}
