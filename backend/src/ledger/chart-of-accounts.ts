/**
 * LE PLAN COMPTABLE D'IGNITUX — et pourquoi il n'y en a pas pour les
 * utilisateurs.
 *
 * ── Ce que ce fichier est ────────────────────────────────────────────────
 *
 * Le strict nécessaire pour qu'IGNITUX puisse écrire ce que le produit
 * constate déjà : un abonnement encaissé, un appel d'IA payé, une
 * participation prise dans un projet, un compte en banque. Rien de plus.
 *
 * ── Ce que ce fichier n'est PAS ──────────────────────────────────────────
 *
 * **Ce n'est pas un plan comptable général certifié.** Les numéros suivent
 * la logique du PCG français (classe 1 capitaux, 2 immobilisations, 4 tiers,
 * 5 trésorerie, 6 charges, 7 produits) parce qu'un comptable les reconnaîtra
 * au premier coup d'œil, mais aucune conformité n'est revendiquée et aucun
 * expert-comptable n'a validé cette liste. Elle sert à tenir des comptes
 * justes en interne, pas à produire une liasse fiscale.
 *
 * ── Pourquoi rien n'est imposé aux utilisateurs ──────────────────────────
 *
 * Parce que leur comptabilité est la leur. Un entrepreneur portugais, suisse
 * ou français n'a ni le même plan, ni le même régime, ni les mêmes
 * obligations, et lui déposer d'office une liste française dans ses livres
 * serait exactement le genre de donnée inventée que l'article 9 interdit.
 * Il ouvre les comptes dont il a besoin — comme il écrit lui-même ses
 * objectifs de rachat plutôt que de les recevoir tout faits.
 */

export const ACCOUNT_KINDS = ['actif', 'passif', 'capitaux', 'produit', 'charge'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export function isAccountKind(value: string): value is AccountKind {
  return (ACCOUNT_KINDS as readonly string[]).includes(value);
}

export interface AccountSeed {
  code: string;
  label: string;
  kind: AccountKind;
}

/**
 * Les comptes qu'IGNITUX ouvre à lui-même.
 *
 * `608-couts-ia` mérite un mot : c'est le compte qui recevra ce que le
 * journal des appels IA mesure déjà en tokens. Les deux dispositifs se
 * rejoignent là — la télémétrie dit ce qui a été consommé, la comptabilité
 * dit ce que ça a coûté, et le plafond de 10 % se vérifie en comparant ce
 * compte au compte 706.
 */
export const IGNITUX_CHART: readonly AccountSeed[] = [
  { code: '101', label: 'Capital', kind: 'capitaux' },
  { code: '261', label: 'Participations dans les projets accompagnés', kind: 'actif' },
  { code: '401', label: 'Fournisseurs', kind: 'passif' },
  { code: '411', label: 'Abonnés', kind: 'actif' },
  { code: '512', label: 'Banque — compte principal', kind: 'actif' },
  { code: '608', label: "Coûts d'IA", kind: 'charge' },
  { code: '627', label: 'Frais bancaires et frais de paiement', kind: 'charge' },
  { code: '628', label: 'Hébergement et services techniques', kind: 'charge' },
  { code: '706', label: 'Abonnements Ignitux', kind: 'produit' },
  { code: '764', label: 'Dividendes reçus des projets accompagnés', kind: 'produit' },
];

/**
 * Les comptes d'IGNITUX qui portent un sens particulier pour le code, et que
 * d'autres modules désignent par leur rôle plutôt que par leur numéro.
 *
 * Passer par ces constantes évite qu'un numéro recopié à la main dans trois
 * modules finisse par désigner trois comptes différents.
 */
export const IGNITUX_ACCOUNTS = {
  banque: '512',
  abonnements: '706',
  coutsIa: '608',
  fraisDePaiement: '627',
  participations: '261',
  dividendes: '764',
} as const;
