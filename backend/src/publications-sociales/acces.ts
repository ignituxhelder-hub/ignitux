import { estOperateurIgnitux } from '../participation/operateurs.js';

/**
 * Qui peut se servir de l'application Réseaux sociaux.
 *
 * Tant qu'Instagram (revue Meta) et TikTok (audit) n'ont pas validé
 * l'application Ignitux, seuls les comptes déclarés dans leurs consoles
 * développeur peuvent s'y connecter : l'ouvrir à tout le monde, ce serait
 * offrir un bouton qui échoue chez eux. Elle reste donc réservée aux
 * opérateurs d'Ignitux (`IGNITUX_OPERATEURS`) jusqu'à ce que
 * `RESEAUX_SOCIAUX_POUR_TOUS=true` l'ouvre à tous.
 */
export function accesOuvert(
  email: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.RESEAUX_SOCIAUX_POUR_TOUS?.trim() === 'true' || estOperateurIgnitux(email, env);
}

/** Ce que voit à la place une personne pour qui ce n'est pas encore ouvert. */
export const CADRE_RESEAUX_SOCIAUX =
  "Ouvrira à tous quand Instagram et TikTok auront validé l'application Ignitux.";
