/**
 * FINANCEMENT IGNITUX — ce que le modèle sait, et ce qu'il ignore.
 *
 * AVERTISSEMENT DE PÉRIMÈTRE, à lire avant toute évolution de ce module.
 *
 * Le cahier des charges décrit le modèle économique en quatre phrases :
 * l'entrepreneur reste propriétaire principal, Ignitux accompagne et
 * finance, l'évolution se fait progressivement vers l'autonomie, et les
 * règles définies dans le projet sont conservées. C'est une direction,
 * pas un barème : aucun taux d'entrée au capital, aucune règle de
 * dilution, aucune formule de rachat, aucune clé de répartition des
 * dividendes n'a jamais été fournie.
 *
 * Ce module ne les invente donc pas. Il enregistre ce qui a réellement
 * été décidé et versé, avec des montants et des parts saisis par des
 * humains, et il rend l'histoire lisible. Concrètement :
 *
 * — pas de valorisation du projet : elle supposerait une méthode
 *   (multiple de CA, actualisation…) que personne n'a choisie ;
 * — pas de dividende prévisionnel : un dividende se constate après coup,
 *   le prédire reviendrait à promettre un revenu ;
 * — pas de part « cible » calculée automatiquement : chaque changement de
 *   répartition est un événement saisi, daté et motivé.
 *
 * Le jour où le modèle chiffré existera, il s'ajoutera par-dessus ces
 * enregistrements sans avoir à les réécrire.
 */
export const FINANCING_SCOPE_NOTICE =
  "Ignitux enregistre ici les financements reçus, la répartition des parts et les dividendes " +
  'réellement versés, à partir de montants que tu saisis. Il ne calcule aucune valorisation du ' +
  "projet, aucun dividende prévisionnel et aucune part « cible » : le modèle économique chiffré " +
  "d'Ignitux (taux d'entrée, règles de dilution et de rachat) n'est pas défini à ce jour, et " +
  'produire ces chiffres sans lui reviendrait à inventer des montants qui engagent ton projet.';

export const FINANCING_SOURCES = ['ignitux', 'porteur', 'pret', 'subvention', 'autre'] as const;
export type FinancingSource = (typeof FINANCING_SOURCES)[number];

/** 10000 points de base = 100 %. Permet 12,5 % sans flottant. */
export const TOTAL_BASIS_POINTS = 10000;

export interface HolderShare {
  holderId: string;
  name: string;
  isFounder: boolean;
  /** Part courante en points de base, ou null si aucun événement ne la fixe. */
  shareBasisPoints: number | null;
}

export interface CapTable {
  holders: HolderShare[];
  /** Somme des parts connues. */
  totalBasisPoints: number;
  /**
   * Écart à 100 %. Non nul = la répartition saisie est incomplète ou
   * incohérente. On le signale au lieu de normaliser en silence :
   * redistribuer automatiquement l'écart reviendrait à décider à la place
   * des personnes qui détiennent ces parts.
   */
  discrepancyBasisPoints: number;
  /**
   * Le porteur détient-il la majorité ? `null` quand la répartition est
   * incomplète — on ne se prononce pas sur une donnée partielle.
   */
  founderHasMajority: boolean | null;
}

/**
 * Construit la répartition courante à partir de l'historique : pour chaque
 * détenteur, le dernier événement dans le temps fait foi.
 */
export function buildCapTable(
  holders: ReadonlyArray<{ id: string; name: string; is_founder: boolean }>,
  events: ReadonlyArray<{ holder_id: string; share_basis_points: number; occurred_at: Date }>,
): CapTable {
  const latest = new Map<string, { share: number; at: number }>();
  for (const event of events) {
    const at = event.occurred_at.getTime();
    const current = latest.get(event.holder_id);
    if (!current || at >= current.at) {
      latest.set(event.holder_id, { share: event.share_basis_points, at });
    }
  }

  const shares: HolderShare[] = holders.map((holder) => ({
    holderId: holder.id,
    name: holder.name,
    isFounder: holder.is_founder,
    shareBasisPoints: latest.get(holder.id)?.share ?? null,
  }));

  const totalBasisPoints = shares.reduce(
    (total, share) => total + (share.shareBasisPoints ?? 0),
    0,
  );
  const discrepancyBasisPoints = TOTAL_BASIS_POINTS - totalBasisPoints;

  const founderShare = shares
    .filter((share) => share.isFounder)
    .reduce((total, share) => total + (share.shareBasisPoints ?? 0), 0);

  return {
    holders: shares,
    totalBasisPoints,
    discrepancyBasisPoints,
    // On ne répond que si la répartition boucle à 100 % : sur une donnée
    // partielle, « oui » comme « non » serait une affirmation infondée.
    founderHasMajority:
      discrepancyBasisPoints === 0 ? founderShare * 2 > TOTAL_BASIS_POINTS : null,
  };
}

/**
 * Trajectoire de la part du porteur dans le temps — la lecture qui donne
 * son sens à « évolution progressive vers l'autonomie ». Aucune projection
 * vers le futur : uniquement les points réellement enregistrés.
 */
export function founderTrajectory(
  founderIds: ReadonlySet<string>,
  events: ReadonlyArray<{ holder_id: string; share_basis_points: number; occurred_at: Date }>,
): Array<{ occurredAt: Date; shareBasisPoints: number }> {
  return events
    .filter((event) => founderIds.has(event.holder_id))
    .slice()
    .sort((left, right) => left.occurred_at.getTime() - right.occurred_at.getTime())
    .map((event) => ({
      occurredAt: event.occurred_at,
      shareBasisPoints: event.share_basis_points,
    }));
}

export function isFinancingSource(value: string): value is FinancingSource {
  return FINANCING_SOURCES.includes(value as FinancingSource);
}
