/**
 * LE BARÈME VU DE LA PAGE D'ACCUEIL — miroir des seuls chiffres qu'elle
 * annonce, tirés de la table du serveur (backend/src/credits/bareme.ts).
 *
 * Depuis le 2026-10-25 il n'y a plus d'abonnement : tous les outils sont
 * gratuits, seules les actions IGINI se paient, en crédits
 * (docs/superpowers/specs/2026-10-25-credits-design.md).
 *
 * Pourquoi une copie plutôt que `GET /credits/bareme` (public) : la page
 * d'accueil est la vitrine. Elle doit s'afficher entière, tout de suite, même
 * quand le serveur dort (Render endort l'instance gratuite) — un « Combien ça
 * coûte ? » vide ou en chargement serait pire qu'un prix. `bareme-public.spec.ts`
 * compare cette copie à la table lue dans le dépôt : un prix changé d'un côté
 * sans l'autre fait échouer la suite, au lieu d'afficher en public un tarif
 * qui n'est plus le bon. L'intérieur de l'application, lui, lit toujours le
 * barème du serveur (`GET /credits`).
 */
export const BAREME_PUBLIC = {
  /** 1 crédit = 10 centimes. */
  valeurCreditCentimes: 10,
  /** Les crédits offerts à l'inscription. */
  bienvenue: 30,
  /** Les recharges proposées (le paiement par carte arrive au lot 2). */
  recharges: [
    { prixCentimes: 1000, credits: 100 },
    { prixCentimes: 2000, credits: 200 },
    { prixCentimes: 5000, credits: 500 },
  ],
  /** Quelques prix pour donner l'ordre de grandeur, en crédits. */
  exemples: {
    analyser: 4,
    construire: 5,
    statuts: 7,
    discuter: 1,
  },
} as const;

export type ExemplePublic = keyof typeof BAREME_PUBLIC.exemples;

/**
 * Des centimes en euros pour un prix affiché : « 20 » plutôt que « 20,00 »,
 * mais « 0,10 » quand il y a des centimes. La langue choisit la virgule ou le
 * point ; le symbole € reste dans le texte traduit.
 */
export function prixEnEuros(centimes: number, locale: string): string {
  const avecCentimes = centimes % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: avecCentimes ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(centimes / 100);
}
