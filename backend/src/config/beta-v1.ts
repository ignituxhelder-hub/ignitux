/**
 * LE PÉRIMÈTRE DE LA BÊTA V1 — ce qu'Ignitux montre pendant le test privé.
 *
 * Portefeuille investisseur et Mentors & investisseurs (marketplace)
 * existent déjà dans le code, mais sont hors du périmètre demandé pour ce
 * test privé et n'ont jamais été revus par un juriste. `IGNITUX_BETA_V1`
 * les tient fermés jusqu'à décision contraire — rien n'est supprimé, tout
 * redevient accessible en changeant une seule variable d'environnement.
 *
 * Même convention que `readGeneratorsAvailability` : tout ce qui n'est pas
 * exactement `'false'` laisse le produit complet.
 */
export function betaV1Actif(flag: string | undefined): boolean {
  return flag !== 'false';
}
