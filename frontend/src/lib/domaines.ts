/**
 * ÉQUIPE, LIVRAISON 2 — QUELLES ROUTES DU SERVEUR SUIVENT L'ESPACE CHOISI.
 *
 * Un comptable ou un associé d'un projet travaille dans la facturation, la
 * comptabilité, la banque et la caisse du propriétaire (spec :
 * docs/superpowers/specs/2026-10-14-equipe-argent-design.md). Dans cet espace,
 * `request()` ajoute l'en-tête `X-Espace` aux SEULES routes de ces quatre
 * modules. Toute autre route ne le reçoit jamais : le serveur la refuserait
 * (403), et elle concerne la personne connectée.
 *
 * La table reprend, route par route, les marques `@Espace('argent')` du
 * serveur. `backend/src/equipe/couverture-espaces.spec.ts` relit
 * `ROUTES_PAR_DOMAINE` ci-dessous et exige qu'elle soit EXACTEMENT la liste
 * des routes @Espace du serveur : une route ajoutée d'un côté sans l'autre
 * fait échouer les tests du backend. On compare le chemin ENTIER, pas un
 * préfixe. Ce qui n'est pas dans la table est personnel — en cas d'oubli, la
 * requête part sans en-tête et montre les données de la personne connectée,
 * jamais celles d'un autre par erreur.
 */

export type DomaineEspace = 'argent' | 'personnel';
export type DomaineDelegable = Exclude<DomaineEspace, 'personnel'>;

export const ROUTES_PAR_DOMAINE: Readonly<Record<DomaineDelegable, readonly string[]>> = {
  argent: [
    '/banque/comptes',
    '/banque/comptes/:id/mouvements',
    '/banque/comptes/:id/solde',
    '/banque/mouvements/:id/rapprochement',
    '/billing/documents',
    '/billing/documents/:id',
    '/billing/documents/:id/payments',
    '/billing/documents/:id/status',
    '/billing/documents/export',
    '/caisse/journees',
    '/comptabilite/balance',
    '/comptabilite/comptes',
    '/comptabilite/ecritures',
  ],
};

function enMotif(modele: string): RegExp {
  const corps = modele
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${corps}$`);
}

const MOTIFS: readonly { motif: RegExp; domaine: DomaineDelegable }[] = (
  Object.entries(ROUTES_PAR_DOMAINE) as [DomaineDelegable, readonly string[]][]
).flatMap(([domaine, modeles]) => modeles.map((modele) => ({ motif: enMotif(modele), domaine })));

/** Le domaine d'une route d'API (`/billing/documents?type=facture` → `argent`). Inconnu → `personnel`. */
export function domaineDuChemin(chemin: string): DomaineEspace {
  const sansRequete = chemin.split(/[?#]/)[0];
  if (!sansRequete.startsWith('/')) return 'personnel';
  return MOTIFS.find(({ motif }) => motif.test(sansRequete))?.domaine ?? 'personnel';
}

/** Cette route doit-elle porter l'espace sélectionné ? */
export function envoieEspace(chemin: string): boolean {
  return domaineDuChemin(chemin) !== 'personnel';
}

/**
 * Le domaine de chaque application du bureau (`lib/systeme.ts`). Dans
 * l'espace d'un autre, seules les applications d'argent s'affichent. Une
 * application absente d'ici est personnelle : elle se cache.
 */
const DOMAINE_PAR_APPLICATION: Readonly<Record<string, DomaineDelegable>> = {
  facturation: 'argent',
  comptabilite: 'argent',
  banque: 'argent',
  caisse: 'argent',
};

export function domaineDeLApplication(appId: string): DomaineEspace {
  return DOMAINE_PAR_APPLICATION[appId] ?? 'personnel';
}


// ── Les rôles ────────────────────────────────────────────────────────────────

export const LIBELLE_ROLE: Readonly<Record<string, string>> = {
  proprietaire: 'Propriétaire',
  associe: 'Associé',
  comptable: 'Comptable',
};

export function libelleRole(role: string): string {
  return LIBELLE_ROLE[role] ?? role;
}

/** « Comptable », « Comptable et associé ». */
export function libelleRoles(roles: readonly string[]): string {
  const libelles = roles.map(libelleRole);
  if (libelles.length <= 1) return libelles[0] ?? '';
  const [premier, ...suite] = libelles;
  return [premier, ...suite.map((l) => l.toLowerCase())].join(' et ');
}
