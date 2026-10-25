/**
 * LES OFFRES — il n'en reste qu'une, et elle est gratuite.
 *
 * Module pur : aucune base, aucun Nest.
 *
 * ## Ce qui a changé le 2026-10-25
 *
 * L'abonnement Entrepreneur (20 €/mois) a disparu
 * (docs/superpowers/specs/2026-10-25-credits-design.md). Tous les outils —
 * projets, comptabilité, facturation, banque, caisse, stocks, agenda, CRM,
 * équipe, financement, documents juridiques — sont gratuits pour tous.
 * **Seules les actions IGINI (les appels à l'IA) se paient, en crédits**, à
 * l'action, au prix du barème (`credits/bareme.ts`). Plus rien ne se décide
 * selon une offre : ni le nombre de projets, ni les générateurs, ni un quota
 * mensuel d'analyses — le solde de crédits est la seule limite.
 *
 * La ligne de partage d'avant tient toujours, en plus net : ce qui ne coûte
 * rien à faire tourner est gratuit ; ce qui coûte à chaque clic se paie, au
 * clic.
 *
 * ## Pourquoi le module existe encore
 *
 * Des lignes en base portent les anciens noms : `subscriptions.offre`
 * (historique, plus jamais lu pour décider d'un accès) et
 * `participation_agreements.ecosystem_offre` (l'accès à l'écosystème garanti
 * par un accord de participation). `normaliserOffre` les reconnaît, pour
 * qu'aucune ne retombe sur « offre inconnue » — elles désignent toutes
 * l'unique offre d'aujourd'hui.
 */

/** Une seule offre : la gratuite, qui contient tout. L'identifiant est celui qu'elle avait en base. */
export const OFFRES = ['decouverte'] as const;
export type OffreId = (typeof OFFRES)[number];

export function estOffre(valeur: string): valeur is OffreId {
  return (OFFRES as readonly string[]).includes(valeur);
}

/**
 * Les offres qui ont existé, avec celle qui les remplace aujourd'hui.
 *
 * « construction » (59 €) avait été fusionnée dans « entrepreneur » (20 €),
 * elle-même remplacée par les crédits : toutes deux désignent désormais
 * l'offre gratuite, qui contient tout ce qu'elles ouvraient.
 */
const OFFRES_FUSIONNEES: Readonly<Record<string, OffreId>> = {
  construction: 'decouverte',
  entrepreneur: 'decouverte',
};

/** L'offre actuelle correspondant à une valeur lue en base, ou `null` si inconnue. */
export function normaliserOffre(valeur: string): OffreId | null {
  if (estOffre(valeur)) return valeur;
  return OFFRES_FUSIONNEES[valeur] ?? null;
}

/**
 * Ce que l'offre ouvre — tout. Gardé sous cette forme parce que la page des
 * offres et l'accès à l'écosystème d'un accord de participation l'affichent.
 */
export interface Capacites {
  /** Nombre de projets simultanés. `null` = sans limite. */
  projets: number | null;
  /** Les six générateurs IGINI (chacun payé en crédits, à l'action). */
  generateurs: readonly GeneratorName[];
  /** Appels aux générateurs par mois civil. `null` = sans limite : le solde de crédits borne. */
  appelsIaParMois: number | null;
  outilsDeGestion: boolean;
  investisseurs: boolean;
  /** Collaborateurs invités par projet. `null` = sans limite. */
  collaborateurs: number | null;
  evaluationFinancement: boolean;
}

import { GENERATEURS_METHODE, type GeneratorName } from '../igini/usage/generator-names.js';
export { GENERATEURS_METHODE as GENERATEURS };
export type { GeneratorName as GenerateurId };

export interface Offre {
  id: OffreId;
  label: string;
  /** Toujours 0 : il n'y a plus d'abonnement. */
  prixCentimes: number;
  resume: string;
  argument: string | null;
  capacites: Capacites;
}

export const CATALOGUE: readonly Offre[] = [
  {
    id: 'decouverte',
    label: 'Gratuit',
    prixCentimes: 0,
    resume:
      'Tout Ignitux, sans abonnement : projets, comptabilité, facturation, banque, caisse, ' +
      'stocks, agenda, contacts, équipe, financement et documents juridiques. Seules les ' +
      'actions d’IGINI se paient, en crédits — 30 offerts à l’inscription.',
    argument: null,
    capacites: {
      projets: null,
      generateurs: [...GENERATEURS_METHODE],
      appelsIaParMois: null,
      outilsDeGestion: true,
      investisseurs: true,
      collaborateurs: null,
      evaluationFinancement: true,
    },
  },
];

/** L'offre de tout le monde. */
export const OFFRE_PAR_DEFAUT: OffreId = 'decouverte';

export function offre(id: OffreId): Offre {
  // Un identifiant hors catalogue retombe sur l'offre gratuite — qui ouvre
  // déjà tout : il n'y a plus rien à protéger derrière.
  return CATALOGUE.find((o) => o.id === id) ?? (CATALOGUE[0] as Offre);
}
