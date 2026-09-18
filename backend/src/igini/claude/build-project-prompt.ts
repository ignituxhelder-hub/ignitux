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
    parts.push(`\nCe qu'IGINI sait déjà de ce projet grâce aux étapes précédentes :\n${context}`);
  }

  return parts.join('\n');
}
