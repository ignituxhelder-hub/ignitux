import { describeOwner, sameOwner, type LedgerOwner } from './ledger-owner.js';

/**
 * CE QU'UNE ÉCRITURE DOIT RESPECTER POUR ÊTRE ÉCRITE.
 *
 * Module pur : aucune base, aucun Nest. Toute la logique d'une écriture
 * valide vit ici et se teste sans rien démarrer. Le service, lui, ne fait que
 * lire, appeler ces contrôles, et écrire.
 *
 * Le contrôle qui justifie ce fichier est `proprietaires-melanges` : une
 * écriture dont une seule ligne pointe vers le compte d'un autre propriétaire
 * est refusée. C'est la traduction technique de « l'argent d'IGNITUX n'est
 * jamais l'argent de la personne ». Sans lui, la séparation ne serait qu'une
 * intention.
 */

export interface DraftLine {
  accountId: string;
  /** En centimes entiers, positif ou nul. */
  debitCents: number;
  /** En centimes entiers, positif ou nul. */
  creditCents: number;
  description?: string;
}

/** Ce que le service doit savoir d'un compte pour valider une écriture. */
export interface AccountRef {
  id: string;
  owner: LedgerOwner;
  currency: string;
}

export interface EntryProblem {
  /** Identifiant stable, pour que les tests visent un contrôle et pas un texte. */
  code:
    | 'aucune-ligne'
    | 'ligne-unique'
    | 'montant-non-entier'
    | 'montant-negatif'
    | 'sens-ambigu'
    | 'ligne-vide'
    | 'compte-inconnu'
    | 'proprietaires-melanges'
    | 'devise-melangee'
    | 'ecriture-desequilibree';
  message: string;
}

export interface EntryTotals {
  debitCents: number;
  creditCents: number;
}

export function totals(lines: ReadonlyArray<DraftLine>): EntryTotals {
  return lines.reduce(
    (acc, line) => ({
      debitCents: acc.debitCents + line.debitCents,
      creditCents: acc.creditCents + line.creditCents,
    }),
    { debitCents: 0, creditCents: 0 },
  );
}

/**
 * Tous les problèmes d'une écriture, pas seulement le premier.
 *
 * Renvoyer la liste entière plutôt que lever à la première erreur : une
 * saisie comptable corrigée problème par problème demande autant
 * d'allers-retours qu'il y a de problèmes, et c'est le genre de détail qui
 * fait abandonner une saisie.
 */
export function validateEntry(input: {
  owner: LedgerOwner;
  currency: string;
  lines: ReadonlyArray<DraftLine>;
  /** Les comptes référencés, indexés par identifiant. */
  accounts: ReadonlyMap<string, AccountRef>;
}): EntryProblem[] {
  const problems: EntryProblem[] = [];
  const { owner, currency, lines, accounts } = input;

  if (lines.length === 0) {
    return [{ code: 'aucune-ligne', message: 'Une écriture sans ligne ne constate rien.' }];
  }

  if (lines.length === 1) {
    // Une écriture à une seule ligne ne peut équilibrer qu'en valant zéro,
    // et une écriture nulle ne constate rien non plus. Le dire ici donne un
    // message utile plutôt qu'un « déséquilibrée » qui laisse chercher.
    problems.push({
      code: 'ligne-unique',
      message:
        'Une écriture comptable a au moins deux lignes : ce qui est débité quelque part est ' +
        'crédité ailleurs.',
    });
  }

  for (const [index, line] of lines.entries()) {
    const rang = index + 1;

    if (!Number.isInteger(line.debitCents) || !Number.isInteger(line.creditCents)) {
      problems.push({
        code: 'montant-non-entier',
        message: `Ligne ${rang} : les montants se comptent en centimes entiers.`,
      });
      continue;
    }

    if (line.debitCents < 0 || line.creditCents < 0) {
      // Le sens est porté par la colonne, jamais par un signe. Un débit
      // négatif est un crédit déguisé, et un crédit déguisé fausse tous les
      // totaux qui additionnent une colonne.
      problems.push({
        code: 'montant-negatif',
        message: `Ligne ${rang} : un montant négatif. Le sens se dit par débit ou crédit, pas par un signe.`,
      });
      continue;
    }

    if (line.debitCents > 0 && line.creditCents > 0) {
      problems.push({
        code: 'sens-ambigu',
        message: `Ligne ${rang} : débitée et créditée à la fois.`,
      });
    }

    if (line.debitCents === 0 && line.creditCents === 0) {
      problems.push({ code: 'ligne-vide', message: `Ligne ${rang} : montant nul.` });
    }

    const account = accounts.get(line.accountId);
    if (!account) {
      problems.push({
        code: 'compte-inconnu',
        message: `Ligne ${rang} : compte « ${line.accountId} » inconnu.`,
      });
      continue;
    }

    if (!sameOwner(account.owner, owner)) {
      // LE contrôle. Une écriture appartient à un propriétaire et à un seul ;
      // une ligne qui pointe ailleurs ferait entrer l'argent de quelqu'un
      // dans les livres d'un autre sans que rien ne le signale.
      problems.push({
        code: 'proprietaires-melanges',
        message:
          `Ligne ${rang} : le compte appartient à ${describeOwner(account.owner)}, ` +
          `l'écriture à ${describeOwner(owner)}. Un mouvement entre deux comptabilités s'enregistre ` +
          'des deux côtés, jamais dans une écriture à cheval.',
      });
    }

    if (account.currency !== currency) {
      problems.push({
        code: 'devise-melangee',
        message: `Ligne ${rang} : compte en ${account.currency}, écriture en ${currency}.`,
      });
    }
  }

  const { debitCents, creditCents } = totals(lines);
  if (debitCents !== creditCents) {
    problems.push({
      code: 'ecriture-desequilibree',
      message:
        `Écriture déséquilibrée : ${formatCents(debitCents)} au débit contre ` +
        `${formatCents(creditCents)} au crédit.`,
    });
  }

  return problems;
}

/** Les centimes en euros lisibles, pour les messages. */
export function formatCents(cents: number): string {
  const signe = cents < 0 ? '-' : '';
  const absolu = Math.abs(cents);
  return `${signe}${Math.floor(absolu / 100)},${String(absolu % 100).padStart(2, '0')} €`;
}

/**
 * Les deux écritures d'un mouvement qui traverse la frontière entre deux
 * comptabilités.
 *
 * C'est la seule opération autorisée à toucher les deux caisses, et elle ne
 * le fait justement pas : elle produit deux écritures distinctes, chacune
 * équilibrée chez son propriétaire. Ce que l'une constate comme une sortie,
 * l'autre le constate comme une entrée, et elles se désignent mutuellement.
 */
export interface TransferSides {
  from: { owner: LedgerOwner; lines: DraftLine[] };
  to: { owner: LedgerOwner; lines: DraftLine[] };
}

export function buildTransferSides(input: {
  from: { owner: LedgerOwner; creditedAccountId: string; debitedAccountId: string };
  to: { owner: LedgerOwner; creditedAccountId: string; debitedAccountId: string };
  amountCents: number;
}): TransferSides {
  const { from, to, amountCents } = input;
  return {
    // Chez l'émetteur : la trésorerie diminue (crédit), une charge ou une
    // créance apparaît (débit).
    from: {
      owner: from.owner,
      lines: [
        { accountId: from.debitedAccountId, debitCents: amountCents, creditCents: 0 },
        { accountId: from.creditedAccountId, debitCents: 0, creditCents: amountCents },
      ],
    },
    // Chez le bénéficiaire : la trésorerie augmente (débit), un produit ou
    // une dette apparaît (crédit).
    to: {
      owner: to.owner,
      lines: [
        { accountId: to.debitedAccountId, debitCents: amountCents, creditCents: 0 },
        { accountId: to.creditedAccountId, debitCents: 0, creditCents: amountCents },
      ],
    },
  };
}
