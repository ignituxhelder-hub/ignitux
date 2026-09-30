/**
 * LA BÊTA V1 — ce qu'Ignitux ajuste pendant le test privé.
 *
 * Sans moyen de paiement configuré (`PAIEMENT_FOURNISSEUR="aucun"`), un
 * compte sans abonnement obtient l'offre Entrepreneur plutôt que la
 * gratuite Découverte (voir `offres.service.ts`), pour que chaque testeur
 * puisse essayer les 6 générateurs IGINI sans être bloqué dès le premier.
 *
 * Même convention que `readGeneratorsAvailability` : tout ce qui n'est pas
 * exactement `'false'` laisse ce comportement de bêta actif.
 */
export function betaV1Actif(flag: string | undefined): boolean {
  return flag !== 'false';
}
