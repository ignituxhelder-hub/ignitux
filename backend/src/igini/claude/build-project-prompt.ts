/**
 * Construit le message envoyé à Claude pour les générateurs IGINI : titre,
 * description, et — quand disponible — ce qu'IGINI sait déjà du projet
 * grâce aux étapes précédentes (la "mémoire commune" entre les modules
 * d'Ignitux : une étape ultérieure doit tenir compte de ce que les étapes
 * précédentes ont déjà établi, pas repartir de zéro).
 */
export function buildProjectPrompt(title: string, description: string | null, context?: string): string {
  const parts = [`Titre : ${title}`, `Description : ${description ?? '(aucune description fournie)'}`];

  if (context) {
    // Le contexte agrège désormais deux sources : la mémoire IGINI (ce que
    // la personne a déjà dit ou décidé) et les étapes précédentes. Chacune
    // arrive avec son propre en-tête, donc l'intitulé générique ici ne doit
    // plus les attribuer aux seules « étapes précédentes » — ce serait
    // présenter une décision du porteur comme une déduction du système.
    parts.push(`\nCe qu'IGINI sait déjà :\n${context}`);
  }

  return parts.join('\n');
}
