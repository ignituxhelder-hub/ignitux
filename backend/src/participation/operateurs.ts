/**
 * QUI PARLE POUR IGNITUX.
 *
 * Le code n'a pas de rôle d'administrateur. La validation d'un palier de
 * participation, comme la création d'un accord, ne doit pourtant jamais
 * revenir à l'entrepreneur seul : ce serait lui laisser décider du moment où
 * il récupère son capital, et des conditions de son propre accord.
 *
 * Tant qu'aucun vrai rôle n'existe, IGNITUX est la liste d'e-mails de la
 * variable `IGNITUX_OPERATEURS` (séparés par des virgules). Absente ou vide :
 * personne n'est opérateur, et rien de ce qui exige IGNITUX n'est possible.
 * C'est volontaire — l'échec ferme la porte, il ne l'ouvre pas.
 */
export function estOperateurIgnitux(
  email: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const cible = email.trim().toLowerCase();
  if (!cible) return false;

  return (env.IGNITUX_OPERATEURS ?? '')
    .split(',')
    .map((entree) => entree.trim().toLowerCase())
    .filter((entree) => entree.length > 0)
    .includes(cible);
}
