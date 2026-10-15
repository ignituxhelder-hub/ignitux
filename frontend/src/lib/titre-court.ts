/**
 * Le titre affiché d'une tâche. Les tâches suggérées par IGINI sont souvent un
 * paragraphe entier : affiché tel quel, cinquante d'entre elles font une page
 * qu'on ne lit plus. On garde la première idée — jusqu'à la première fin de
 * phrase ou articulation (« — », « : », « ; ») — et le texte complet reste à
 * un clic.
 */
export const LONGUEUR_TITRE = 120;

// Une articulation trop tôt couperait « Mois 1 à 2 — … » en « Mois 1 à 2 ».
const MINIMUM = 25;
const COUPURES = /[.?!](?=\s)|\s[—:;]\s/g;

export function titreCourt(texte: string): string {
  const propre = texte.trim();
  if (propre.length <= LONGUEUR_TITRE) return propre;

  for (const coupure of propre.matchAll(COUPURES)) {
    const position = coupure.index ?? 0;
    if (position < MINIMUM) continue;
    if (position > LONGUEUR_TITRE) break;
    // La ponctuation finale reste ; une articulation devient « … ».
    return /[.?!]/.test(coupure[0]) ? propre.slice(0, position + 1) : `${propre.slice(0, position)}…`;
  }

  const coupe = propre.slice(0, LONGUEUR_TITRE);
  const dernierEspace = coupe.lastIndexOf(' ');
  return `${(dernierEspace > MINIMUM ? coupe.slice(0, dernierEspace) : coupe).replace(/[\s,;:—-]+$/, '')}…`;
}
