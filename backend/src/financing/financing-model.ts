/**
 * FINANCEMENT IGNITUX — le modèle économique, tel qu'il a été défini.
 *
 * Le modèle a été transmis par le porteur du projet le 19 septembre 2026 et
 * remplace l'avertissement de périmètre qui disait, honnêtement à l'époque,
 * qu'aucun barème n'existait. Il tient en quatre règles :
 *
 *   1. À l'entrée, l'entrepreneur garde 51 % et IGNITUX reçoit 49 %.
 *   2. IGNITUX apporte analyse, accompagnement, IA, outils, financement et
 *      réseau.
 *   3. En atteignant ses objectifs (rentabilité, autonomie, stabilité),
 *      l'entrepreneur rachète progressivement les parts d'IGNITUX jusqu'à
 *      100 %.
 *   4. Même à 100 %, il reverse 5 % des dividendes RÉELLEMENT VERSÉS —
 *      pas du chiffre d'affaires, pas du bénéfice brut.
 *
 * Ce que ce module calcule et ce qu'il ne calcule toujours pas :
 *
 * — il calcule la part perpétuelle de 5 %, parce que la règle est exacte
 *   et s'applique à un montant déjà versé ;
 * — il n'invente pas les seuils de « rentabilité », « autonomie » et
 *   « stabilité » qui déclenchent le rachat : le modèle nomme ces objectifs
 *   sans les chiffrer, et fabriquer des seuils reviendrait à décider à la
 *   place du porteur à quel moment il peut racheter ses parts ;
 * — il ne valorise pas le projet : aucune méthode de valorisation n'a été
 *   choisie, donc aucun prix de rachat ne peut être déduit ;
 * — il n'annonce aucun dividende prévisionnel : un dividende se constate.
 */
export const FINANCING_SCOPE_NOTICE =
  "Le modèle IGNITUX est appliqué ici : 51 % pour l'entrepreneur et 49 % pour Ignitux à " +
  "l'entrée, rachat progressif jusqu'à 100 % lorsque les objectifs sont atteints, puis 5 % " +
  'des dividendes réellement versés reversés à Ignitux à vie. Ignitux calcule cette part de ' +
  "5 % sur les dividendes que tu enregistres, et rien d'autre : ni valorisation du projet, ni " +
  'prix de rachat, ni dividende prévisionnel. Les seuils qui déclenchent le rachat ' +
  '(rentabilité, autonomie, stabilité) ne sont pas chiffrés dans le modèle — ils restent ta ' +
  'décision.';

/** Répartition à l'entrée, en points de base (10000 = 100 %). */
export const FOUNDER_ENTRY_BASIS_POINTS = 5100;
export const IGNITUX_ENTRY_BASIS_POINTS = 4900;

/**
 * Part des dividendes reversée à Ignitux à perpétuité : 5 %, soit 500
 * points de base. Elle porte sur les dividendes RÉELLEMENT VERSÉS, jamais
 * sur le chiffre d'affaires ni sur le bénéfice brut — la distinction est
 * dans le modèle et elle change tout.
 */
export const PERPETUAL_DIVIDEND_BASIS_POINTS = 500;

/**
 * Part revenant à Ignitux sur un dividende versé. Arrondi au centime
 * supérieur écarté volontairement : on arrondit au plus proche, comme
 * partout ailleurs dans le code monétaire de ce projet.
 */
export function perpetualShareCents(distributedCents: number): number {
  return Math.round((distributedCents * PERPETUAL_DIVIDEND_BASIS_POINTS) / 10000);
}

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
 *
 * ── Deux événements le même jour ────────────────────────────────────────
 *
 * `occurred_at` est saisi par la personne, et une interface qui propose un
 * champ « date » y met minuit. Deux changements enregistrés le même jour —
 * un investisseur entre, le porteur est dilué, ou plus simplement une
 * correction faite dans la foulée — portent donc **exactement la même
 * valeur**.
 *
 * La première version comparait ces seules dates et gardait le dernier
 * élément *itéré*, c'est-à-dire l'ordre que la base voulait bien rendre.
 * Postgres ne promet rien là-dessus : un autre plan d'exécution, un index,
 * un VACUUM, et la réponse change. Constaté sur la vraie base — deux
 * événements du même jour, 4 000 puis 10 000 points de base, et la lecture
 * retenait **4 000**, la valeur périmée. Quelqu'un qui corrige sa
 * répartition le jour même voyait donc sa correction ignorée, en silence,
 * et la garantie des 51 % se calculait sur le mauvais chiffre.
 *
 * `created_at` départage : à date égale, c'est ce qui a été enregistré en
 * dernier qui fait foi. C'est aussi la seule lecture qui a du sens — on ne
 * corrige pas vers le passé.
 */
export function buildCapTable(
  holders: ReadonlyArray<{ id: string; name: string; is_founder: boolean }>,
  events: ReadonlyArray<{
    holder_id: string;
    share_basis_points: number;
    occurred_at: Date;
    /** Optionnel : absent des anciens appels et des jeux de test minimaux. */
    created_at?: Date | null;
  }>,
): CapTable {
  const latest = new Map<string, { share: number; at: number; saisiA: number }>();
  for (const event of events) {
    const at = event.occurred_at.getTime();
    const saisiA = event.created_at?.getTime() ?? 0;
    const current = latest.get(event.holder_id);
    const plusRecent =
      !current || at > current.at || (at === current.at && saisiA >= current.saisiA);
    if (plusRecent) {
      latest.set(event.holder_id, { share: event.share_basis_points, at, saisiA });
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
