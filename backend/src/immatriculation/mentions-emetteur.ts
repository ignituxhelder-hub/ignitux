/**
 * MENTIONS DE L'ÉMETTEUR — le texte figé sur un devis ou une facture à
 * l'émission (`billing_documents.issuer_details`).
 *
 * Module pur. Il ne recopie que ce que la personne a saisi (fiche
 * d'immatriculation), ce qu'elle a confirmé (forme juridique) et ce qu'elle
 * a retenu (capital des statuts). Rien n'est complété ni deviné : une
 * information absente est une ligne absente.
 */

export interface SourceMentions {
  legalName: string;
  /** `projects.confirmed_legal_form`, ou null. */
  legalForm: string | null;
  /** Capital des statuts RETENUS, en centimes, ou null s'il n'est pas connu. */
  capitalCents: number | null;
  headOffice: string;
  siren: string;
  siret: string | null;
  vatNumber: string | null;
}

/** 100000 → « 1 000,00 € » (espaces ordinaires : le texte part tel quel dans un document). */
export function formaterEuros(cents: number): string {
  const entier = Math.floor(Math.abs(cents) / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimales = String(Math.abs(cents) % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${entier},${decimales} €`;
}

/** « 443061841 » → « 443 061 841 », la présentation du Kbis. */
export function formaterSiren(siren: string): string {
  return siren.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
}

/** « 44306184100013 » → « 443 061 841 00013 ». */
export function formaterSiret(siret: string): string {
  return siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
}

/**
 * Les formes d'entrepreneur individuel, dont la mention légale est
 * « Entrepreneur individuel (EI) » (le régime micro n'est pas une forme
 * juridique) — et qui n'ont pas de capital social.
 */
const FORMES_ENTREPRENEUR_INDIVIDUEL = ['micro-entreprise', 'EI'];
const MENTION_EI = 'Entrepreneur individuel (EI)';

export function mentionsEmetteur(source: SourceMentions): string {
  const lignes: string[] = [source.legalName];

  if (source.legalForm && FORMES_ENTREPRENEUR_INDIVIDUEL.includes(source.legalForm)) {
    lignes.push(MENTION_EI);
  } else if (source.legalForm) {
    lignes.push(
      source.capitalCents !== null && source.capitalCents > 0
        ? `${source.legalForm} au capital de ${formaterEuros(source.capitalCents)}`
        : source.legalForm,
    );
  }
  lignes.push(`Siège : ${source.headOffice}`);
  lignes.push(`SIREN : ${formaterSiren(source.siren)}`);
  if (source.siret) lignes.push(`SIRET : ${formaterSiret(source.siret)}`);
  if (source.vatNumber) lignes.push(`TVA intracommunautaire : ${source.vatNumber}`);

  return lignes.join('\n');
}
