/**
 * LA LIMITE GLOBALE DE REQUÊTES — par minute et par adresse IP.
 *
 * Elle s'applique à toutes les routes qui n'ont pas leur propre `@Throttle()`.
 * Les routes sensibles (connexion, inscription, mot de passe oublié) gardent
 * leurs limites strictes, posées directement sur elles.
 *
 * Elle valait 20 jusqu'au 11/10/2026 : trop peu pour un usage normal. Ouvrir
 * un projet charge déjà une douzaine de ressources, une évaluation en
 * préparation se relit toutes les 5 secondes, et plusieurs personnes derrière
 * la même box partagent la même adresse. Constaté par le test de charge.
 */
export const LIMITE_GLOBALE_PAR_DEFAUT = 120;

/** `LIMITE_REQUETES_PAR_MINUTE`, ou la valeur par défaut si elle est absente ou illisible. */
export function lireLimiteGlobale(brut: string | undefined): number {
  const texte = brut?.trim();
  if (!texte) return LIMITE_GLOBALE_PAR_DEFAUT;
  const lu = Number(texte);
  // Une faute de frappe ne doit ni ouvrir les vannes (0, négatif) ni tout bloquer.
  return Number.isInteger(lu) && lu >= 1 ? lu : LIMITE_GLOBALE_PAR_DEFAUT;
}
