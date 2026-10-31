/**
 * LES OUTILS RECOMMANDÉS — pour la gestion au quotidien, des outils
 * spécialisés font très bien leur métier : Ignitux le dit, au lieu de
 * prétendre tout faire (positionnement du 2026-10-31 : IGINI est le guide,
 * pas un concurrent des logiciels de compta ou des banques en ligne).
 *
 * Des recommandations, pas des partenaires : Ignitux n'a aucun accord
 * commercial avec ces entreprises et ne touche rien quand quelqu'un les
 * choisit — l'accueil le dit en toutes lettres. Pas de logo (ce sont leurs
 * marques) : le nom, ce que l'outil fait (messages, `accueil.outils.liste`)
 * et un lien vers son site.
 *
 * Une seule liste, pour que l'accueil et, plus tard, IGINI orientent vers les
 * mêmes outils.
 */
export interface OutilRecommande {
  id: 'pennylane' | 'qonto' | 'shine';
  nom: string;
  url: string;
  /** Ce que l'outil prend en charge — `accueil.outils.domaines`. */
  domaine: 'comptabilite' | 'banque';
}

export const OUTILS_RECOMMANDES: readonly OutilRecommande[] = [
  { id: 'pennylane', nom: 'Pennylane', url: 'https://www.pennylane.com', domaine: 'comptabilite' },
  { id: 'qonto', nom: 'Qonto', url: 'https://qonto.com', domaine: 'banque' },
  { id: 'shine', nom: 'Shine', url: 'https://www.shine.fr', domaine: 'banque' },
];
