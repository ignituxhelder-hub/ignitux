/**
 * IDENTIFIANTS D'ENTREPRISE — contrôles purs, sans base ni Nest.
 *
 * Ce qu'ils vérifient : la FORME des numéros (longueur, clé de Luhn, clé de
 * TVA). Ce qu'ils ne vérifient pas : que l'entreprise existe. Aucun appel au
 * répertoire SIRENE n'est fait — un SIREN bien formé peut être celui d'une
 * autre entreprise, ou d'aucune. Le texte de l'interface le dit.
 */

/** Retire les espaces (y compris insécables) tapés à la saisie : « 732 829 320 ». */
export function sansEspaces(valeur: string): string {
  return valeur.replace(/[\s  ]+/g, '');
}

/** Clé de Luhn sur une chaîne de chiffres. */
export function luhnValide(chiffres: string): boolean {
  if (!/^\d+$/.test(chiffres)) return false;
  let somme = 0;
  for (let i = 0; i < chiffres.length; i += 1) {
    // En partant de la droite, un chiffre sur deux est doublé.
    let chiffre = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

/** SIREN de La Poste : ses SIRET ne suivent pas la clé de Luhn. Exception non gérée (voir la spec). */
export const SIREN_LA_POSTE = '356000000';

export type Resultat = { ok: true; valeur: string } | { ok: false; message: string };

export function verifierSiren(saisie: string): Resultat {
  const siren = sansEspaces(saisie);
  if (!/^\d{9}$/.test(siren)) {
    return { ok: false, message: 'Le SIREN compte exactement 9 chiffres.' };
  }
  if (!luhnValide(siren)) {
    return { ok: false, message: 'Ce SIREN n’est pas valide (sa clé de contrôle ne correspond pas). Vérifie-le sur ton Kbis.' };
  }
  return { ok: true, valeur: siren };
}

/** Le SIRET doit être valide ET commencer par le SIREN déjà vérifié. */
export function verifierSiret(saisie: string, siren: string): Resultat {
  const siret = sansEspaces(saisie);
  if (!/^\d{14}$/.test(siret)) {
    return { ok: false, message: 'Le SIRET compte exactement 14 chiffres.' };
  }
  if (siret.slice(0, 9) !== siren) {
    return { ok: false, message: 'Les 9 premiers chiffres du SIRET doivent être le SIREN.' };
  }
  if (!luhnValide(siret)) {
    if (siren === SIREN_LA_POSTE) {
      return {
        ok: false,
        message:
          'Les SIRET de La Poste suivent une règle de contrôle particulière qu’Ignitux ne gère pas : ' +
          'laisse le SIRET vide.',
      };
    }
    return { ok: false, message: 'Ce SIRET n’est pas valide (sa clé de contrôle ne correspond pas).' };
  }
  return { ok: true, valeur: siret };
}

/** Clé numérique d'un numéro de TVA français : (12 + 3 × (SIREN mod 97)) mod 97. */
export function cleTvaFrancaise(siren: string): number {
  return (12 + 3 * (Number(siren) % 97)) % 97;
}

/**
 * Numéro de TVA intracommunautaire français : `FR` + 2 caractères de clé + SIREN.
 * Une clé numérique est vérifiée ; une clé alphanumérique (ancien régime des
 * nouveaux assujettis) est acceptée sans vérification.
 */
export function verifierTva(saisie: string, siren: string): Resultat {
  const tva = sansEspaces(saisie).toUpperCase();
  const forme = /^FR([0-9A-Z]{2})(\d{9})$/.exec(tva);
  if (!forme) {
    return {
      ok: false,
      message: 'Le numéro de TVA intracommunautaire français s’écrit FR + 2 caractères + les 9 chiffres du SIREN.',
    };
  }
  const [, cle, sirenDansTva] = forme;
  if (sirenDansTva !== siren) {
    return { ok: false, message: 'Le numéro de TVA doit se terminer par le SIREN.' };
  }
  if (/^\d{2}$/.test(cle) && Number(cle) !== cleTvaFrancaise(siren)) {
    return { ok: false, message: 'La clé de ce numéro de TVA ne correspond pas au SIREN.' };
  }
  return { ok: true, valeur: tva };
}

export interface SaisieFiche {
  siren: string;
  siret?: string | null;
  vatNumber?: string | null;
  legalName: string;
  headOffice: string;
  /** `AAAA-MM-JJ`. */
  registeredOn: string;
}

export interface FicheNormalisee {
  siren: string;
  siret: string | null;
  vatNumber: string | null;
  legalName: string;
  headOffice: string;
  /** Minuit UTC du jour saisi — la colonne est un `@db.Date`. */
  registeredOn: Date;
}

const DATE_MIN = Date.UTC(2000, 0, 1);
const UN_JOUR_MS = 24 * 60 * 60 * 1000;

/** Lit une date `AAAA-MM-JJ` réelle (pas de 31 février), ou null. */
export function lireDateIso(saisie: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(saisie);
  if (!m) return null;
  const [an, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(an, mois - 1, jour));
  if (date.getUTCFullYear() !== an || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) {
    return null;
  }
  return date;
}

/**
 * Contrôle et normalise une fiche complète. Rend TOUTES les erreurs d'un
 * coup plutôt que la première (même raisonnement que validateEntry).
 */
export function normaliserFiche(
  saisie: SaisieFiche,
  maintenant: Date = new Date(),
): { ok: true; fiche: FicheNormalisee } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];

  const siren = verifierSiren(saisie.siren);
  if (!siren.ok) erreurs.push(siren.message);

  let siret: string | null = null;
  const siretSaisi = saisie.siret ? sansEspaces(saisie.siret) : '';
  if (siretSaisi && siren.ok) {
    const r = verifierSiret(siretSaisi, siren.valeur);
    if (r.ok) siret = r.valeur;
    else erreurs.push(r.message);
  }

  let vatNumber: string | null = null;
  const tvaSaisie = saisie.vatNumber ? sansEspaces(saisie.vatNumber) : '';
  if (tvaSaisie && siren.ok) {
    const r = verifierTva(tvaSaisie, siren.valeur);
    if (r.ok) vatNumber = r.valeur;
    else erreurs.push(r.message);
  }

  const legalName = saisie.legalName.trim();
  if (legalName.length < 1 || legalName.length > 200) {
    erreurs.push('La dénomination compte de 1 à 200 caractères.');
  }
  const headOffice = saisie.headOffice.trim();
  if (headOffice.length < 1 || headOffice.length > 300) {
    erreurs.push('L’adresse du siège compte de 1 à 300 caractères.');
  }

  const registeredOn = lireDateIso(saisie.registeredOn);
  if (!registeredOn) {
    erreurs.push('La date d’immatriculation doit être une date réelle au format AAAA-MM-JJ.');
  } else {
    const aujourdHui = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
    if (registeredOn.getTime() < DATE_MIN) {
      erreurs.push('La date d’immatriculation ne peut pas être antérieure au 1er janvier 2000.');
    } else if (registeredOn.getTime() > aujourdHui + UN_JOUR_MS) {
      erreurs.push('La date d’immatriculation ne peut pas être dans le futur.');
    }
  }

  if (erreurs.length > 0 || !siren.ok || !registeredOn) {
    return { ok: false, erreurs };
  }
  return {
    ok: true,
    fiche: { siren: siren.valeur, siret, vatNumber, legalName, headOffice, registeredOn },
  };
}
