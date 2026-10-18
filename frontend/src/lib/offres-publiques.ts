/**
 * LES OFFRES VUES DE LA PAGE D'ACCUEIL — miroir des seuls chiffres qu'elle
 * annonce, tirés du catalogue du serveur (backend/src/offres/offres-catalogue.ts).
 *
 * La page d'accueil s'affiche avant toute connexion, et `GET /offres` demande
 * un compte : elle ne peut pas lire le catalogue. Elle en garde donc une copie,
 * et `offres-publiques.spec.ts` la compare au catalogue lu dans le dépôt — un
 * prix changé d'un côté sans l'autre fait échouer la suite, au lieu d'afficher
 * en public un tarif qui n'est plus le bon.
 *
 * Ce que cette copie ne suit pas : `OFFRE_<ID>_PRIX_CENTIMES`, qui peut changer
 * le prix côté serveur sans redéploiement. Le jour où il sert, la page
 * d'accueil doit être mise à jour avec lui.
 */
export const OFFRES_PUBLIQUES = {
  decouverte: { prixCentimes: 0, projets: 1, appelsIaParMois: 3 },
  entrepreneur: { prixCentimes: 2000, projets: null, appelsIaParMois: 35 },
} as const;

/**
 * Des centimes en euros pour un prix affiché : « 20 » plutôt que « 20,00 »,
 * mais « 9,90 » quand il y a des centimes. La langue choisit la virgule ou le
 * point ; le symbole € reste dans le texte traduit.
 */
export function prixEnEuros(centimes: number, locale: string): string {
  const avecCentimes = centimes % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: avecCentimes ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(centimes / 100);
}
