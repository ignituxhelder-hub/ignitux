import { IGNITUX_CHART, type AccountKind } from '../ledger/chart-of-accounts.js';

/**
 * LE CAPITAL CONNU, ET L'ÉCRITURE QU'IL PERMET DE PROPOSER — module pur.
 *
 * « Connu » veut dire : écrit dans des statuts RETENUS, rédigés pour la forme
 * juridique confirmée aujourd'hui sur le projet, et celle-ci crée une
 * personne morale. Un brouillon, des statuts restés d'une forme précédente,
 * une micro-entreprise ou une EI : pas de capital connu, donc rien à
 * afficher ni à proposer.
 */

export const FORMES_AVEC_PERSONNE_MORALE = ['EURL', 'SASU', 'SARL', 'SAS'] as const;

export function estFormeAvecPersonneMorale(forme: string | null | undefined): boolean {
  return !!forme && (FORMES_AVEC_PERSONNE_MORALE as readonly string[]).includes(forme);
}

export interface StatutsPourCapital {
  status: string;
  legal_form: string;
  capital_cents: number;
}

export function capitalConnuCents(
  formeConfirmee: string | null | undefined,
  statuts: StatutsPourCapital | null | undefined,
): number | null {
  if (!estFormeAvecPersonneMorale(formeConfirmee) || !statuts) return null;
  if (statuts.status !== 'retenue' || statuts.legal_form !== formeConfirmee) return null;
  return statuts.capital_cents > 0 ? statuts.capital_cents : null;
}

/** Les deux comptes de l'écriture, avec les libellés du plan comptable du dépôt. */
function compteDuPlan(code: string): { code: string; label: string; kind: AccountKind } {
  const seed = IGNITUX_CHART.find((compte) => compte.code === code);
  if (!seed) throw new Error(`Compte ${code} absent du plan comptable du dépôt.`);
  return { code: seed.code, label: seed.label, kind: seed.kind };
}

export const COMPTE_BANQUE = compteDuPlan('512');
export const COMPTE_CAPITAL = compteDuPlan('101');

export interface LignePropositionCapital {
  compte: string;
  libelleCompte: string;
  natureCompte: AccountKind;
  debitCents: number;
  creditCents: number;
}

export interface PropositionCapital {
  montantCents: number;
  libelle: string;
  /** Date de l'écriture proposée : la date d'immatriculation, `AAAA-MM-JJ`. */
  date: string;
  lignes: LignePropositionCapital[];
}

export function propositionCapital(input: {
  formeConfirmee: string | null | undefined;
  statuts: StatutsPourCapital | null | undefined;
  legalName: string;
  registeredOn: Date;
}): PropositionCapital | null {
  const montantCents = capitalConnuCents(input.formeConfirmee, input.statuts);
  if (montantCents === null) return null;
  return {
    montantCents,
    libelle: `Apport en capital — ${input.legalName}`,
    date: input.registeredOn.toISOString().slice(0, 10),
    lignes: [
      {
        compte: COMPTE_BANQUE.code,
        libelleCompte: COMPTE_BANQUE.label,
        natureCompte: COMPTE_BANQUE.kind,
        debitCents: montantCents,
        creditCents: 0,
      },
      {
        compte: COMPTE_CAPITAL.code,
        libelleCompte: COMPTE_CAPITAL.label,
        natureCompte: COMPTE_CAPITAL.kind,
        debitCents: 0,
        creditCents: montantCents,
      },
    ],
  };
}
