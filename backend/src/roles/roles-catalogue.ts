/**
 * LE VOCABULAIRE DES RÔLES — ce qu'une personne peut être dans Ignitux.
 *
 * Un rôle est une **vue**, jamais un conteneur. Il ne possède aucune donnée :
 * les projets appartiennent à la personne, les investissements aussi, et un
 * rôle décide seulement de ce qui lui est montré. C'est ce qui permet à
 * quelqu'un d'être entrepreneur et investisseur sans que rien ne soit écrit
 * deux fois — et sans que deux copies finissent par se contredire.
 *
 * Le catalogue vit dans le code et non en base pour la même raison que la
 * Constitution : un rôle est une brique de produit qu'on relit, pas une
 * donnée qu'on saisit.
 */

/** Les domaines de données que l'application sait servir. */
export const DATA_DOMAINS = [
  'projets',
  'facturation',
  'relations',
  'conformite',
  'comptabilite',
  'investissements',
  'portefeuille',
] as const;

export type DataDomain = (typeof DATA_DOMAINS)[number];

export const ROLE_IDS = [
  'entrepreneur',
  'investisseur',
  'mentor',
  'expert',
  'partenaire',
  'administrateur',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleDefinition {
  id: RoleId;
  label: string;
  /** Ce que ce rôle permet, en une phrase — reprise telle quelle à l'écran. */
  summary: string;
  /**
   * `false` = le rôle est nommé mais rien n'existe derrière.
   *
   * On le déclare quand même : l'architecture doit pouvoir l'accueillir, et
   * dire « pas encore » est plus honnête que de le cacher, puis plus honnête
   * encore que de l'ouvrir sur un espace vide.
   */
  available: boolean;
  /** La page d'accueil de son espace. null tant qu'il n'y en a pas. */
  home: string | null;
  /**
   * Les domaines que ce rôle peut lire. Deux rôles ouverts ne partagent
   * aucun domaine : c'est là que se joue la séparation, et la règle
   * constitutionnelle `roles-separes` la fait respecter à l'exécution.
   */
  domains: readonly DataDomain[];
}

export const ROLES: readonly RoleDefinition[] = [
  {
    id: 'entrepreneur',
    label: 'Entrepreneur',
    summary:
      'Tu portes un ou plusieurs projets : les analyser, les construire, les financer, ' +
      'les développer, les transmettre.',
    available: true,
    home: '/projects',
    domains: ['projets', 'facturation', 'relations', 'conformite', 'comptabilite'],
  },
  {
    id: 'investisseur',
    label: 'Investisseur',
    summary:
      "Tu places de l'argent dans les projets d'autres personnes : suivre ce qui est " +
      'investi, ce qui revient, et où en est chaque participation.',
    available: true,
    home: '/investisseur',
    domains: ['investissements', 'portefeuille'],
  },
  {
    id: 'mentor',
    label: 'Mentor',
    summary: "Accompagner d'autres porteurs de projet.",
    available: false,
    home: null,
    domains: [],
  },
  {
    id: 'expert',
    label: 'Expert',
    summary: 'Intervenir sur un point précis — juridique, comptable, technique.',
    available: false,
    home: null,
    domains: [],
  },
  {
    id: 'partenaire',
    label: 'Partenaire',
    summary: 'Contribuer à un projet sans y investir ni le porter.',
    available: false,
    home: null,
    domains: [],
  },
  {
    id: 'administrateur',
    label: 'Administrateur',
    summary: "Administrer l'instance Ignitux elle-même.",
    available: false,
    home: null,
    domains: [],
  },
];

const PAR_ID = new Map<string, RoleDefinition>(ROLES.map((role) => [role.id, role]));

export function findRole(id: string): RoleDefinition | undefined {
  return PAR_ID.get(id);
}

export function isRoleId(value: string): value is RoleId {
  return PAR_ID.has(value);
}

/** Les rôles qu'une personne peut réellement prendre aujourd'hui. */
export function openRoles(): readonly RoleDefinition[] {
  return ROLES.filter((role) => role.available);
}

/**
 * Les domaines qu'un rôle a le droit de lire.
 *
 * Un rôle inconnu ou fermé ne rend pas « tout » par défaut mais rien : une
 * erreur de configuration doit fermer, pas ouvrir.
 */
export function domainsOf(roleId: string): readonly DataDomain[] {
  return PAR_ID.get(roleId)?.domains ?? [];
}

/**
 * Les domaines demandés qui ne relèvent pas de ce rôle.
 *
 * Vide = la vue est propre. Le contenu de ce tableau est exactement ce que
 * la règle constitutionnelle reproche.
 */
export function foreignDomains(
  roleId: string,
  requested: readonly string[],
): readonly string[] {
  const permis = new Set<string>(domainsOf(roleId));
  return requested.filter((domain) => !permis.has(domain));
}
