/**
 * À QUI APPARTIENT CET ARGENT.
 *
 * C'est la pièce dont dépend toute la séparation des caisses. Elle est
 * petite exprès : une notion de propriété qui se dilue dans dix endroits
 * finit par avoir dix définitions, et neuf d'entre elles seront fausses le
 * jour où elles comptent.
 *
 * ── Pourquoi ce module existe ────────────────────────────────────────────
 *
 * Avant lui, tout ce que le produit suivait financièrement appartenait aux
 * utilisateurs : `billing_documents` sont les factures que l'entrepreneur
 * envoie à SES clients, `equity_holders` est la table de capitalisation de
 * SON projet. IGNITUX n'avait aucun livre — alors que `financing_rounds`
 * accepte déjà `source = 'ignitux'`, c'est-à-dire de l'argent d'IGNITUX
 * versé dans le projet de quelqu'un. Cette dépense n'existait que du côté
 * du bénéficiaire. Personne, en lisant la base, n'aurait pu dire ce
 * qu'IGNITUX avait dépensé.
 *
 * ── Les deux règles ──────────────────────────────────────────────────────
 *
 * 1. **Aucune écriture sans propriétaire.** Tenu par le schéma :
 *    `owner_type` et `owner_id` sont NOT NULL. « Sans propriétaire » n'est
 *    pas un état représentable, donc pas un état à tester au cas par cas.
 *
 * 2. **Aucune écriture avec deux propriétaires.** Un mouvement entre IGNITUX
 *    et une personne n'est pas une écriture à cheval : ce sont DEUX
 *    écritures, une dans chaque comptabilité, qui se désignent l'une
 *    l'autre. Voir `recordTransfer`.
 */

/**
 * L'identifiant d'IGNITUX dans les tables financières.
 *
 * IGNITUX n'est pas une ligne de `users` — ce n'est pas une personne, et lui
 * en fabriquer une le ferait apparaître dans les exports RGPD, les listes de
 * collaborateurs et les recherches de contacts. Il porte donc un UUID
 * sentinelle, constant et documenté.
 *
 * L'alternative aurait été de laisser `owner_id` nul pour IGNITUX. Elle a
 * été écartée pour deux raisons, et la seconde est la vraie : en Postgres,
 * deux `null` sont distincts dans un index unique, ce qui aurait laissé
 * créer deux comptes IGNITUX portant le même code ; et surtout, un `null`
 * aurait rendu « sans propriétaire » représentable, alors que tout ce module
 * existe pour que ça ne le soit pas.
 */
export const IGNITUX_OWNER_ID = '00000000-0000-0000-0000-000000000000';

export const OWNER_TYPES = ['ignitux', 'user'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

/**
 * Le propriétaire d'un objet financier.
 *
 * Union discriminée plutôt qu'une paire de champs libres : un
 * `{ type: 'user' }` sans `userId` ne compile pas, et un
 * `{ type: 'ignitux', userId }` non plus. La forme impossible est donc
 * inexprimable, ce qui vaut mieux qu'une validation qu'on peut oublier
 * d'appeler.
 */
export type LedgerOwner = { readonly type: 'ignitux' } | { readonly type: 'user'; readonly userId: string };

export const IGNITUX: LedgerOwner = { type: 'ignitux' };

export function userOwner(userId: string): LedgerOwner {
  return { type: 'user', userId };
}

/** Les deux colonnes telles qu'elles partent en base. */
export interface OwnerColumns {
  owner_type: string;
  owner_id: string;
}

export function ownerColumns(owner: LedgerOwner): OwnerColumns {
  return owner.type === 'ignitux'
    ? { owner_type: 'ignitux', owner_id: IGNITUX_OWNER_ID }
    : { owner_type: 'user', owner_id: owner.userId };
}

/**
 * Relit un propriétaire depuis une ligne de base.
 *
 * Lève plutôt que de deviner. Une ligne financière dont le propriétaire est
 * illisible n'a pas de valeur par défaut raisonnable : l'attribuer à IGNITUX
 * lui donnerait l'argent de quelqu'un, l'attribuer à personne contredirait
 * la règle 1. Dans les deux cas on préfère s'arrêter.
 */
export function ownerFromColumns(row: OwnerColumns): LedgerOwner {
  if (row.owner_type === 'ignitux') {
    if (row.owner_id !== IGNITUX_OWNER_ID) {
      throw new Error(
        `Ligne financière incohérente : owner_type « ignitux » avec owner_id « ${row.owner_id} ».`,
      );
    }
    return IGNITUX;
  }
  if (row.owner_type === 'user') {
    if (row.owner_id === IGNITUX_OWNER_ID) {
      throw new Error(
        "Ligne financière incohérente : owner_type « user » portant l'identifiant d'IGNITUX.",
      );
    }
    return userOwner(row.owner_id);
  }
  throw new Error(`Propriétaire inconnu « ${row.owner_type} » sur une ligne financière.`);
}

export function sameOwner(a: LedgerOwner, b: LedgerOwner): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'ignitux') return true;
  return a.userId === (b as { type: 'user'; userId: string }).userId;
}

export function isIgnitux(owner: LedgerOwner): boolean {
  return owner.type === 'ignitux';
}

/** Libellé lisible, pour les messages d'erreur et les journaux. */
export function describeOwner(owner: LedgerOwner): string {
  return owner.type === 'ignitux' ? 'IGNITUX' : `l'utilisateur ${owner.userId}`;
}

/**
 * Filtre Prisma pour n'obtenir que ce qui appartient à ce propriétaire.
 *
 * Toute lecture financière passe par là. Un `where` recopié à la main est
 * exactement ce qu'on oublie un jour, et ce jour-là quelqu'un voit les
 * comptes d'un autre.
 */
export function ownerWhere(owner: LedgerOwner): OwnerColumns {
  return ownerColumns(owner);
}
