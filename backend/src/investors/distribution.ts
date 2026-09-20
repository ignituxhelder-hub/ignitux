import { PERPETUAL_DIVIDEND_BASIS_POINTS, perpetualShareCents } from '../financing/financing-model.js';

/**
 * RÉPARTIR UN VERSEMENT ENTRE LES INVESTISSEURS D'UN PROJET.
 *
 * Module pur : aucune base, aucun Nest. C'est ici que vit tout le calcul, et
 * il se teste sans rien démarrer.
 *
 * ── Le problème, qui n'est pas celui qu'on croit ─────────────────────────
 *
 * Répartir 1 000 € entre trois investisseurs au prorata est trivial ; le
 * faire **sans perdre ni inventer un centime** ne l'est pas. Trois parts
 * égales de 100 000 centimes donnent 33 333 chacune, soit 99 999 : un
 * centime s'évapore. Répartir au centime supérieur en crée un.
 *
 * Un centime par versement, sur des milliers de projets et des années, ce
 * n'est pas une coquette : c'est un écart permanent entre ce que le projet a
 * versé et ce que les investisseurs ont reçu, qui grossit tout seul et que
 * personne ne sait expliquer.
 *
 * La méthode retenue est celle du **plus fort reste** : on attribue à chacun
 * sa part entière, puis on distribue les centimes restants, un par un, à
 * ceux dont la fraction perdue était la plus grande. La somme est alors
 * exacte par construction, et la règle d'attribution du reste est
 * déterministe — donc rejouable et vérifiable.
 */

/** Ce qu'on sait d'une participation pour répartir. */
export interface DistributionShare {
  participationId: string;
  investorId: string;
  /** La base du prorata : ce que cet investisseur a mis. */
  weightCents: number;
}

export interface Allocation {
  participationId: string;
  investorId: string;
  amountCents: number;
}

export interface DistributionProblem {
  code:
    | 'montant-non-entier'
    | 'montant-non-positif'
    | 'aucun-investisseur'
    | 'poids-nul'
    | 'poids-negatif';
  message: string;
}

export function validateDistribution(
  amountCents: number,
  shares: ReadonlyArray<DistributionShare>,
): DistributionProblem[] {
  const problems: DistributionProblem[] = [];

  if (!Number.isInteger(amountCents)) {
    problems.push({ code: 'montant-non-entier', message: 'Un versement se compte en centimes entiers.' });
  } else if (amountCents <= 0) {
    problems.push({
      code: 'montant-non-positif',
      message: 'Un versement porte un montant strictement positif.',
    });
  }

  if (shares.length === 0) {
    problems.push({
      code: 'aucun-investisseur',
      message: "Ce projet n'a aucun investisseur à qui répartir ce versement.",
    });
    return problems;
  }

  if (shares.some((share) => share.weightCents < 0)) {
    problems.push({ code: 'poids-negatif', message: 'Un montant investi ne peut pas être négatif.' });
  }

  const total = shares.reduce((sum, share) => sum + share.weightCents, 0);
  if (total <= 0) {
    // Sans base de prorata, toute répartition serait arbitraire. On refuse
    // plutôt que de partager en parts égales : « égales » serait une
    // décision, pas un calcul, et elle ne nous appartient pas.
    problems.push({
      code: 'poids-nul',
      message:
        'Les participations de ce projet totalisent zéro : il n’existe aucune base de ' +
        'répartition. Répartir en parts égales serait une décision, pas un calcul.',
    });
  }

  return problems;
}

/**
 * Répartit `amountCents` au prorata des `weightCents`, au centime exact.
 *
 * La somme des allocations est **toujours** égale à `amountCents` : c'est la
 * propriété qui justifie ce module, et le test la vérifie sur des dizaines
 * de milliers de tirages.
 *
 * L'ordre départage les ex æquo : à reste égal, le premier de la liste
 * reçoit le centime. C'est arbitraire, mais déterministe — et un partage
 * déterministe se rejoue et se contrôle, là où un partage aléatoire ne
 * s'explique jamais.
 */
export function allocatePro(
  amountCents: number,
  shares: ReadonlyArray<DistributionShare>,
): Allocation[] {
  const totalWeight = shares.reduce((sum, share) => sum + share.weightCents, 0);
  if (totalWeight <= 0) return [];

  // Part entière, et le reste exact gardé sous forme de numérateur : on ne
  // compare jamais des fractions flottantes, uniquement des entiers.
  const brut = shares.map((share, index) => {
    const numerateur = amountCents * share.weightCents;
    return {
      index,
      participationId: share.participationId,
      investorId: share.investorId,
      entier: Math.floor(numerateur / totalWeight),
      reste: numerateur % totalWeight,
    };
  });

  const distribue = brut.reduce((sum, ligne) => sum + ligne.entier, 0);
  let centimesRestants = amountCents - distribue;

  // Les plus forts restes d'abord ; à égalité, l'ordre d'origine.
  const parReste = [...brut].sort((a, b) => b.reste - a.reste || a.index - b.index);
  for (const ligne of parReste) {
    if (centimesRestants <= 0) break;
    ligne.entier += 1;
    centimesRestants -= 1;
  }

  return brut.map((ligne) => ({
    participationId: ligne.participationId,
    investorId: ligne.investorId,
    amountCents: ligne.entier,
  }));
}

export interface DividendSplit {
  /** Ce qui revient à Ignitux au titre des 5 % perpétuels. */
  ignituxCents: number;
  /** Ce qui reste à répartir entre les investisseurs. */
  investorsCents: number;
  allocations: Allocation[];
}

/**
 * Répartit un dividende, en prélevant d'abord la part perpétuelle d'Ignitux.
 *
 * Les 5 % sortent **du montant versé**, avant le prorata : c'est ce que dit
 * le modèle — « 5 % des dividendes réellement versés ». Le calcul réutilise
 * `perpetualShareCents` plutôt que de refaire la règle ; une seconde
 * implémentation de la même règle finit toujours par diverger de la
 * première.
 *
 * `applyPerpetualShare` à false quand le projet n'est pas soumis à cette
 * règle — un projet financé sans qu'Ignitux entre au capital, par exemple.
 * Le produit ne devine pas : l'appelant dit.
 */
export function splitDividend(
  amountCents: number,
  shares: ReadonlyArray<DistributionShare>,
  applyPerpetualShare: boolean,
): DividendSplit {
  const ignituxCents = applyPerpetualShare ? perpetualShareCents(amountCents) : 0;
  const investorsCents = amountCents - ignituxCents;
  return {
    ignituxCents,
    investorsCents,
    allocations: allocatePro(investorsCents, shares),
  };
}

export { PERPETUAL_DIVIDEND_BASIS_POINTS };

export const MOVEMENT_KINDS = [
  'investissement',
  'remboursement_capital',
  'dividende',
  'gain',
  'correction',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export function isMovementKind(value: string): value is MovementKind {
  return (MOVEMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Le sens attendu d'un mouvement, du point de vue de l'investisseur.
 *
 * Un investissement sort de sa poche (négatif) ; un remboursement, un
 * dividende et un gain y entrent (positif). Seule une correction peut aller
 * dans les deux sens — c'est sa raison d'être.
 */
export function signIsCoherent(kind: MovementKind, amountCents: number): boolean {
  if (kind === 'correction') return amountCents !== 0;
  if (kind === 'investissement') return amountCents < 0;
  return amountCents > 0;
}

export interface PortfolioTotals {
  investedCents: number;
  repaidCents: number;
  dividendsCents: number;
  gainsCents: number;
  /** Ce qui est revenu, moins ce qui a été mis. Négatif tant que le capital n'est pas rentré. */
  netCents: number;
}

/**
 * Totaux d'un portefeuille à partir des mouvements.
 *
 * Les corrections ne sont **pas** une catégorie à part dans les totaux :
 * elles s'ajoutent à la catégorie qu'elles rectifient, sinon un montant
 * corrigé resterait visible dans son poste d'origine et le total ne
 * correspondrait plus à la réalité. C'est pour ça qu'une correction porte le
 * mouvement qu'elle vise.
 */
/** Un mouvement, reduit a ce dont les totaux ont besoin. */
export interface MovementRow {
  id: string;
  kind: string;
  amount_cents: number;
  corrects_movement_id: string | null;
}

export function portfolioTotals(movements: ReadonlyArray<MovementRow>): PortfolioTotals {
  // Une correction se rattache au poste du mouvement qu elle vise : la
  // laisser dans une categorie « correction » laisserait le montant errone
  // visible dans son poste d origine, et le total cesserait de decrire la
  // realite. C est pour cela qu une correction porte sa cible.
  const genreParId = new Map(movements.map((m) => [m.id, m.kind]));

  const totals: PortfolioTotals = {
    investedCents: 0,
    repaidCents: 0,
    dividendsCents: 0,
    gainsCents: 0,
    netCents: 0,
  };

  for (const movement of movements) {
    let effectif = movement.kind;
    if (movement.kind === 'correction' && movement.corrects_movement_id) {
      effectif = genreParId.get(movement.corrects_movement_id) ?? 'correction';
    }

    switch (effectif) {
      case 'investissement':
        // Stocke negatif ; le portefeuille affiche « montant investi ».
        totals.investedCents -= movement.amount_cents;
        break;
      case 'remboursement_capital':
        totals.repaidCents += movement.amount_cents;
        break;
      case 'dividende':
        totals.dividendsCents += movement.amount_cents;
        break;
      case 'gain':
        totals.gainsCents += movement.amount_cents;
        break;
      default:
        break;
    }
    totals.netCents += movement.amount_cents;
  }

  return totals;
}
