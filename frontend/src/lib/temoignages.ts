/**
 * LES TÉMOIGNAGES — vides tant qu'aucune vraie personne n'a donné son accord.
 *
 * Aucun témoignage inventé, même marqué « exemple » : un faux avis est une
 * pratique commerciale trompeuse, et la devise de l'accueil est « La vérité
 * avant tout ». La section de l'accueil n'apparaît qu'à partir d'un
 * témoignage (composant `Temoignages`).
 *
 * Pour en ajouter un : les mots exacts de la personne, tels qu'elle les a
 * écrits, et la date de son accord écrit — garder le message qui le prouve.
 * `temoignages.spec.ts` refuse une entrée sans accord daté.
 */
export interface Temoignage {
  /** Prénom, ou prénom et initiale : ce que la personne a accepté de montrer. */
  nom: string;
  /** Son projet ou son activité, en quelques mots (« Boulangerie à Lyon »). */
  activite: string;
  /** Ses mots, dans sa langue, sans retouche. */
  texte: string;
  /** Date de son accord écrit, AAAA-MM-JJ. */
  accordLe: string;
}

export const TEMOIGNAGES: readonly Temoignage[] = [];
