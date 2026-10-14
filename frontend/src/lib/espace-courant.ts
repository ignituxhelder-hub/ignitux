/**
 * L'ESPACE COURANT — dans quel espace la personne travaille.
 *
 * `null` = « Mon espace » (ses propres données). Sinon, l'espace argent d'un
 * propriétaire dont elle est comptable ou associée : `request()` ajoute alors
 * l'en-tête `X-Espace` aux routes d'argent (voir `domaines.ts`).
 *
 * Mémorisé dans le navigateur, et pour UNE personne : l'entrée porte l'id de
 * l'utilisateur connecté, et une autre personne qui se connecte sur le même
 * appareil repart dans son propre espace. Effacé à la déconnexion.
 */

export interface EspaceChoisi {
  ownerId: string;
  nom: string;
  roles: string[];
}

export const CLE_ESPACE = 'ignitux.espace';

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function estEspace(valeur: unknown): valeur is EspaceChoisi {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const e = valeur as Partial<EspaceChoisi>;
  return (
    typeof e.ownerId === 'string' &&
    e.ownerId.length > 0 &&
    typeof e.nom === 'string' &&
    Array.isArray(e.roles) &&
    e.roles.every((r) => typeof r === 'string')
  );
}

/** L'espace choisi par cette personne, ou null (« Mon espace »). */
export function lireEspaceChoisi(stockage: Stockage | null, userId: string): EspaceChoisi | null {
  try {
    const brut = stockage?.getItem(CLE_ESPACE);
    if (!brut) return null;
    const valeur = JSON.parse(brut) as { userId?: unknown; espace?: unknown };
    if (valeur?.userId !== userId || !estEspace(valeur.espace)) return null;
    // Jamais « l'espace d'un autre » qui serait le sien.
    if (valeur.espace.ownerId === userId) return null;
    const { ownerId, nom, roles } = valeur.espace;
    return { ownerId, nom, roles: [...roles] };
  } catch {
    return null;
  }
}

export function ecrireEspaceChoisi(stockage: Stockage | null, userId: string, espace: EspaceChoisi | null): void {
  try {
    if (!espace || espace.ownerId === userId) stockage?.removeItem(CLE_ESPACE);
    else stockage?.setItem(CLE_ESPACE, JSON.stringify({ userId, espace }));
  } catch {
    // Sans mémoire, le choix vaut le temps de la page.
  }
}

export function oublierEspaceChoisi(stockage: Stockage | null): void {
  try {
    stockage?.removeItem(CLE_ESPACE);
  } catch {
    // Rien à faire.
  }
}

/** « Espace de Alice » → « l'espace de Alice » ; sinon le nom tel quel. */
export function nomDansPhrase(nom: string): string {
  return nom.startsWith('Espace ') ? `l’espace ${nom.slice('Espace '.length)}` : nom;
}
