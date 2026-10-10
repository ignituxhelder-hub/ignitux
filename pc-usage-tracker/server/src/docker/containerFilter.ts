/**
 * Un conteneur correspond au filtre si son nom (sans le "/" que renvoie
 * l'API Docker) contient la chaîne de filtre, sans distinction de casse.
 * Un filtre vide ne matche jamais rien — sans quoi tout conteneur actif sur
 * la machine serait, par erreur, compté comme temps IGNITUX.
 */
export function matchesFilter(containerName: string, filter: string): boolean {
  const normalizedName = containerName.replace(/^\//, '').toLowerCase();
  const normalizedFilter = filter.trim().toLowerCase();
  if (normalizedFilter === '') return false;
  return normalizedName.includes(normalizedFilter);
}

export function selectMatchingNames(names: string[], filter: string): string[] {
  return names.filter((name) => matchesFilter(name, filter));
}
