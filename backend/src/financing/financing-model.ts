import { DEFAULT_ENTRY_SPLIT } from '../participation/participation-model.js';

/**
 * FINANCEMENT IGNITUX — le modèle économique, tel qu'il a été défini.
 *
 * Le modèle sépare trois choses, qui ne se mélangent jamais :
 *
 *   1. LE CAPITAL — l'entrepreneur et IGNITUX se partagent le capital au
 *      départ ; la part d'IGNITUX ne fait que baisser, par paliers validés
 *      par IGNITUX, jusqu'à 0 %. La structure de départ actuelle est
 *      51 % / 49 %, mais c'est la valeur de départ de chaque accord, pas une
 *      règle : chaque accord porte sa répartition et ses paliers.
 *   2. LE DROIT SUR LES DIVIDENDES — une fois le capital entièrement
 *      transmis, IGNITUX conserve 5 % des dividendes RÉELLEMENT VERSÉS (taux
 *      par défaut, porté par l'accord). Ce n'est pas une part de capital, ni
 *      du chiffre d'affaires, ni du bénéfice.
 *   3. L'ACCÈS À L'ÉCOSYSTÈME — défini par l'accord, indépendant des deux
 *      autres.
 *
 * Aucun palier ne dépend du temps : il est validé quand les conditions
 * définies pour le projet sont remplies. Voir `participation/`.
 *
 * Ce que ce module calcule et ce qu'il ne calcule toujours pas :
 *
 * — il calcule le droit de 5 %, parce que la règle est exacte et s'applique
 *   à un montant déjà versé ;
 * — il n'invente pas les seuils qui déclenchent un palier : fabriquer des
 *   seuils reviendrait à décider à la place des personnes à quel moment le
 *   capital se transmet ;
 * — il ne valorise pas le projet : aucune méthode de valorisation n'a été
 *   choisie, donc aucun prix de rachat ne peut être déduit ;
 * — il n'annonce aucun dividende prévisionnel : un dividende se constate.
 */
export const FINANCING_SCOPE_NOTICE =
  "Le modèle IGNITUX distingue trois choses. Le capital : la structure de départ actuelle est " +
  "51 % pour l'entrepreneur et 49 % pour Ignitux, valeur de départ propre à chaque accord et " +
  "jamais une règle ; la part d'Ignitux ne fait que baisser, par paliers validés par Ignitux, " +
  "jusqu'à 0 %, et aucun palier ne dépend du temps. Le droit sur les dividendes : uniquement " +
  'une fois le capital entièrement transmis, 5 % des dividendes réellement versés (taux par ' +
  "défaut de l'accord), distinct du capital — ce n'est pas une part de capital. L'accès à " +
  "l'écosystème Ignitux : défini par l'accord, indépendant des deux autres. Ignitux calcule ce " +
  "droit sur les dividendes que tu enregistres, et rien d'autre : ni valorisation du projet, ni " +
  "prix de rachat, ni dividende prévisionnel. Les conditions qui déclenchent un palier ne sont " +
  "pas chiffrées par Ignitux : elles sont définies projet par projet.";

/**
 * Répartition d'entrée actuelle, en points de base (10000 = 100 %).
 *
 * Valeurs PAR DÉFAUT d'un nouvel accord, pas une règle : un accord recopie
 * ces valeurs à sa création puis porte les siennes. La source unique est
 * `participation/participation-model.ts`.
 */
export const FOUNDER_ENTRY_BASIS_POINTS = DEFAULT_ENTRY_SPLIT.founderBasisPoints;
export const IGNITUX_ENTRY_BASIS_POINTS = DEFAULT_ENTRY_SPLIT.ignituxBasisPoints;

/**
 * ANCIEN MÉCANISME du moteur investisseurs — à ne pas confondre avec le droit
 * économique du nouveau modèle de participation.
 *
 * Le moteur investisseurs (`investors/`) peut prélever 5 % d'un versement
 * quand on le lui demande explicitement, à n'importe quel moment. Ce n'est PAS
 * le droit économique d'IGNITUX : celui-là n'existe qu'une fois le capital
 * entièrement transmis, est porté par l'accord et enregistré à part
 * (`participation/`, `dividend_right_entries`). Cette constante reste pour ne
 * rien casser sur les projets existants ; elle sera nettoyée dans une étape
 * ultérieure, une fois le nouveau mécanisme adopté partout.
 *
 * 5 % = 500 points de base, sur les dividendes RÉELLEMENT VERSÉS, jamais sur
 * le chiffre d'affaires ni sur le bénéfice brut.
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
