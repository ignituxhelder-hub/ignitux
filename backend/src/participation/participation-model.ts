/**
 * PARTICIPATION IGNITUX — le modèle pur, sans base ni Nest.
 *
 * Trois couches, qui ne se mélangent jamais :
 *
 *   1. LE CAPITAL        — qui détient quelle part. Vit dans `equity_events`,
 *                          seule autorité. IGNITUX peut y descendre jusqu'à 0 %.
 *   2. LE DROIT ÉCONOMIQUE — un pourcentage des dividendes DISTRIBUÉS, dû
 *                          uniquement quand IGNITUX est à 0 % du capital.
 *                          Ce n'est pas une part de capital et n'y est jamais
 *                          écrit.
 *   3. L'ACCÈS À L'ÉCOSYSTÈME — défini par l'accord, indépendant des deux
 *                          autres (voir `ecosystem_offre` sur l'accord).
 *
 * ── Ce que ce module refuse de coder ─────────────────────────────────────
 *
 * Aucune fonction ici ne prend une durée, une date d'échéance ou un nombre
 * d'années. Un palier de participation n'est jamais déclenché par le temps :
 * il est validé par IGNITUX quand les conditions définies pour CE projet sont
 * remplies, puis exécuté à une date effective choisie. Les pourcentages
 * intermédiaires (60/40, 80/20…) n'existent nulle part ici non plus : chaque
 * accord porte les siens.
 *
 * Les seules valeurs fixes sont celles de la structure de départ actuelle
 * (51/49) et du droit sur les dividendes (5 %), et ce ne sont que des
 * VALEURS PAR DÉFAUT, recopiées dans chaque accord à sa création. Un accord
 * ne relit jamais ces constantes : il porte les siennes.
 */

/** 10000 points de base = 100 %. */
export const TOTAL_BASIS_POINTS = 10000;

/** Structure de départ actuelle du modèle. Valeur par défaut, pas une règle. */
export const DEFAULT_ENTRY_SPLIT = {
  founderBasisPoints: 5100,
  ignituxBasisPoints: 4900,
} as const;

/** 5 % des dividendes distribués. Valeur par défaut, recopiée dans l'accord. */
export const DEFAULT_DIVIDEND_RIGHT_BASIS_POINTS = 500;

/** L'offre que le contrat garantit par défaut. Modifiable par accord. */
export const DEFAULT_ECOSYSTEM_OFFRE = 'construction';

export interface AgreementTerms {
  founderBasisPoints: number;
  ignituxBasisPoints: number;
  dividendRightBasisPoints: number;
}

export interface ParticipationProblem {
  code:
    | 'non-entier'
    | 'total-incorrect'
    | 'porteur-non-majoritaire'
    | 'droit-dividendes-invalide'
    | 'cible-invalide'
    | 'ignitux-remonte';
  message: string;
}

/**
 * Les termes de départ d'un accord sont-ils recevables ?
 *
 * Le porteur doit être strictement majoritaire au départ : c'est le principe
 * du modèle actuel. On ne vérifie PAS que la répartition vaut 51/49 — un
 * accord peut partir d'ailleurs.
 */
export function validateAgreementTerms(terms: AgreementTerms): ParticipationProblem[] {
  const problems: ParticipationProblem[] = [];
  const values = [terms.founderBasisPoints, terms.ignituxBasisPoints, terms.dividendRightBasisPoints];

  if (!values.every(Number.isInteger)) {
    problems.push({
      code: 'non-entier',
      message: 'Les parts se comptent en points de base entiers (10000 = 100 %).',
    });
    return problems;
  }

  if (terms.founderBasisPoints < 0 || terms.ignituxBasisPoints < 0) {
    problems.push({ code: 'total-incorrect', message: 'Une part ne peut pas être négative.' });
  }

  if (terms.founderBasisPoints + terms.ignituxBasisPoints !== TOTAL_BASIS_POINTS) {
    problems.push({
      code: 'total-incorrect',
      message: 'La part du porteur et celle d’IGNITUX doivent totaliser exactement 100 %.',
    });
  }

  if (terms.founderBasisPoints * 2 <= TOTAL_BASIS_POINTS) {
    problems.push({
      code: 'porteur-non-majoritaire',
      message: 'Le porteur doit être majoritaire dès le départ.',
    });
  }

  if (terms.dividendRightBasisPoints < 0 || terms.dividendRightBasisPoints > TOTAL_BASIS_POINTS) {
    problems.push({
      code: 'droit-dividendes-invalide',
      message: 'Le droit sur les dividendes doit être compris entre 0 et 100 %.',
    });
  }

  return problems;
}

/**
 * Un palier peut-il viser cette part d'IGNITUX ?
 *
 * La seule règle structurelle : la part d'IGNITUX ne fait que baisser, de
 * palier en palier, jusqu'à 0 %. Rien d'autre n'est imposé sur sa valeur.
 */
export function validateMilestoneTarget(
  currentIgnituxBasisPoints: number,
  targetIgnituxBasisPoints: number,
): ParticipationProblem[] {
  if (
    !Number.isInteger(targetIgnituxBasisPoints) ||
    targetIgnituxBasisPoints < 0 ||
    targetIgnituxBasisPoints > TOTAL_BASIS_POINTS
  ) {
    return [
      {
        code: 'cible-invalide',
        message: 'La part visée doit être un entier de points de base entre 0 et 10000.',
      },
    ];
  }

  if (targetIgnituxBasisPoints >= currentIgnituxBasisPoints) {
    return [
      {
        code: 'ignitux-remonte',
        message:
          'La part d’IGNITUX ne peut que diminuer : un palier doit viser une part strictement ' +
          'inférieure à la part actuelle.',
      },
    ];
  }

  return [];
}

export type ParticipationPhase = 'partagee' | 'transmise' | 'inconnue';

/**
 * Où en est la transmission du capital, lue dans le capital lui-même.
 *
 * Jamais saisie à la main : `null` (aucun événement de capital pour IGNITUX)
 * donne « inconnue » plutôt qu'un « transmise » par défaut.
 */
export function participationPhase(ignituxBasisPoints: number | null): ParticipationPhase {
  if (ignituxBasisPoints === null) return 'inconnue';
  return ignituxBasisPoints === 0 ? 'transmise' : 'partagee';
}

/**
 * Le droit économique d'IGNITUX sur un dividende effectivement distribué.
 *
 * Le montant en entrée est le dividende distribué, jamais un chiffre
 * d'affaires ni un bénéfice. Aucun dividende → rien à payer. Le taux est
 * celui de l'accord, passé en paramètre.
 */
export function dividendRightDueCents(distributedCents: number, rightBasisPoints: number): number {
  if (!Number.isInteger(distributedCents) || distributedCents < 0) {
    throw new Error('Un dividende distribué se compte en centimes entiers, positifs ou nuls.');
  }
  return Math.round((distributedCents * rightBasisPoints) / TOTAL_BASIS_POINTS);
}
