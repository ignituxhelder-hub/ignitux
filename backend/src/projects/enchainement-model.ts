import { BAREME } from '../credits/bareme.js';

/**
 * L'ENCHAÎNEMENT IGINI — « tout projet est fait automatiquement ».
 *
 * Décidé avec Helder le 2026-10-31 : la règle des 75/100 (Former offert
 * au-dessus, « reprends ton idée » en dessous) disparaît. Un clic lance les
 * cinq étapes l'une après l'autre, chacune payée en crédits au prix du
 * barème, annoncé avant le clic.
 *
 * Restent à la demande : la transmission (voir journey-model.ts, elle ne se
 * propose pas d'elle-même), les statuts et les démarches (ils demandent des
 * choix et des pièces de la personne).
 *
 * Module pur : aucune base, aucun Nest.
 */
export const ETAPES_ENCHAINEMENT = [
  { id: 'analyser', libelle: 'L’analyse' },
  { id: 'former', libelle: 'La forme juridique' },
  { id: 'construire', libelle: 'Le plan de construction' },
  { id: 'financer', libelle: 'Le plan de financement' },
  { id: 'developper', libelle: 'Le plan de développement' },
] as const;

export type EtapeEnchainement = (typeof ETAPES_ENCHAINEMENT)[number]['id'];
export type EtatEtapeEnchainement = 'a-faire' | 'en-cours' | 'fait';

/**
 * - `pret` : rien ne tourne, il reste des étapes à faire ;
 * - `en-cours` : une étape tourne en ce moment ;
 * - `termine` : les cinq étapes sont faites ;
 * - `arrete` : une étape a été refusée (crédits, pause, plafond) ou a échoué.
 */
export type StatutEnchainement = 'pret' | 'en-cours' | 'termine' | 'arrete';

export interface ArretEnchainement {
  etape: EtapeEnchainement;
  /** Lu tel quel par la personne. */
  message: string;
  /** Un solde trop bas : « Voir mes crédits » a un sens. */
  voirCredits: boolean;
}

export interface VueEnchainement {
  statut: StatutEnchainement;
  etapes: Array<{ id: EtapeEnchainement; libelle: string; credits: number; etat: EtatEtapeEnchainement }>;
  /** Le prix des étapes qui restent à faire, en crédits. */
  creditsRestants: number;
  arret: ArretEnchainement | null;
}

/** Ce que le serveur suit pendant qu'un enchaînement tourne, ou après son arrêt. */
export interface SuiviEnchainement {
  enCours: EtapeEnchainement | null;
  arret: ArretEnchainement | null;
}

/**
 * La vue d'un projet : ce qui est fait vient de la base (seule source qui
 * survit à un redémarrage), ce qui tourne et pourquoi ça s'est arrêté vient
 * du suivi en mémoire.
 */
export function vueEnchainement(
  faites: ReadonlySet<EtapeEnchainement>,
  suivi: SuiviEnchainement | null,
): VueEnchainement {
  const etapes = ETAPES_ENCHAINEMENT.map(({ id, libelle }) => ({
    id,
    libelle,
    credits: BAREME[id].credits,
    etat: (faites.has(id) ? 'fait' : suivi?.enCours === id ? 'en-cours' : 'a-faire') as EtatEtapeEnchainement,
  }));
  const creditsRestants = etapes.filter((e) => e.etat !== 'fait').reduce((total, e) => total + e.credits, 0);

  let statut: StatutEnchainement;
  if (suivi?.enCours) statut = 'en-cours';
  else if (etapes.every((e) => e.etat === 'fait')) statut = 'termine';
  else if (suivi?.arret) statut = 'arrete';
  else statut = 'pret';

  return { statut, etapes, creditsRestants, arret: statut === 'arrete' ? (suivi?.arret ?? null) : null };
}
