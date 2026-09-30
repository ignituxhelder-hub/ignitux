/**
 * LE PÉRIMÈTRE DE LA BÊTA V1 — miroir de backend/src/config/beta-v1.ts.
 *
 * Portefeuille investisseur et Mentors & investisseurs (marketplace) sont
 * hors du périmètre demandé pour ce test privé. Le vrai garde est côté
 * serveur (BetaV1Guard) : ce fichier ne fait que rediriger proprement au
 * lieu de laisser la personne face à une erreur 403 brute.
 */
export function betaV1Actif(flag: string | undefined): boolean {
  return flag !== 'false';
}

/**
 * Calculée une fois, à la compilation : Next.js remplace
 * `process.env.NEXT_PUBLIC_BETA_V1` par sa valeur littérale au build, donc
 * la lire ailleurs ne fonctionnerait pas — elle doit être écrite ici, telle
 * quelle.
 */
export const BETA_V1_ACTIF = betaV1Actif(process.env.NEXT_PUBLIC_BETA_V1);
