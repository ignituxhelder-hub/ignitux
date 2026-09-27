/**
 * LE SYSTÈME — ce qui fait d'Ignitux un bureau plutôt qu'un site.
 *
 * On entre dans Ignitux comme on allume un ordinateur : un bureau, des
 * applications, et une barre des tâches qui garde celles qu'on a ouvertes.
 * Chaque application occupe tout l'écran, une seule à la fois ; on passe de
 * l'une à l'autre par la barre, et chacune se rouvre là où on l'avait
 * laissée.
 *
 * Ce module est pur : il dit à quelle application appartient une adresse,
 * et comment la liste des tâches évolue. L'affichage vit dans
 * `components/systeme.tsx`.
 *
 * La liste ci-dessous reflète le catalogue du serveur
 * (`backend/src/applications/applications-catalogue.ts`) — ids, noms et
 * adresses. `systeme.spec.ts` lit ce fichier et échoue si les deux
 * divergent : une application ajoutée côté serveur sans être déclarée ici
 * s'ouvrirait sans sa barre.
 */

export interface AppSysteme {
  id: string;
  nom: string;
  route: string;
  /** D'autres adresses qui appartiennent à la même application. */
  aussi?: readonly string[];
}

export const APPS_SYSTEME: readonly AppSysteme[] = [
  { id: 'parcours', nom: 'Mes projets', route: '/projects' },
  { id: 'relations', nom: 'Relations', route: '/crm' },
  { id: 'facturation', nom: 'Facturation', route: '/facturation' },
  { id: 'comptabilite', nom: 'Comptabilité', route: '/comptabilite' },
  { id: 'banque', nom: 'Banque', route: '/banque' },
  { id: 'portefeuille', nom: 'Portefeuille', route: '/investisseur' },
  { id: 'communaute', nom: 'Communauté', route: '/community' },
  { id: 'reseau', nom: 'Mentors & investisseurs', route: '/marketplace' },
  { id: 'profil', nom: 'Mon profil', route: '/profil' },
  { id: 'offres', nom: 'Mon offre', route: '/offres' },
  { id: 'consommation-ia', nom: 'Consommation IA', route: '/consommation-ia' },
  { id: 'constitution', nom: 'Constitution', route: '/constitution' },
  // Les rôles se règlent avec le compte : ce sont des casquettes, pas une
  // application à part.
  { id: 'compte', nom: 'Mon compte', route: '/account', aussi: ['/roles'] },
  { id: 'stocks', nom: 'Stocks', route: '/stocks' },
  { id: 'caisse', nom: 'Caisse', route: '/caisse' },
  { id: 'boutique-en-ligne', nom: 'Boutique en ligne', route: '/boutique-en-ligne' },
  { id: 'agenda', nom: 'Agenda', route: '/agenda' },
  { id: 'immobilier', nom: 'Immobilier', route: '/immobilier' },
  { id: 'vehicules', nom: 'Véhicules', route: '/vehicules' },
  { id: 'publicite', nom: 'Publicité', route: '/publicite' },
];

export const BUREAU = '/accueil';

function couvre(prefixe: string, chemin: string): boolean {
  return chemin === prefixe || chemin.startsWith(`${prefixe}/`);
}

/** L'application à laquelle appartient une adresse, ou null (bureau, connexion…). */
export function applicationDe(chemin: string): AppSysteme | null {
  return (
    APPS_SYSTEME.find((app) => [app.route, ...(app.aussi ?? [])].some((p) => couvre(p, chemin))) ??
    null
  );
}

export function applicationParId(id: string): AppSysteme | null {
  return APPS_SYSTEME.find((app) => app.id === id) ?? null;
}

/** Deux lettres, pour que chaque application se reconnaisse d'un coup d'œil. */
export function monogramme(nom: string): string {
  const mots = nom.split(/[\s&]+/).filter(Boolean);
  return (mots.length > 1 ? mots[0][0] + mots[1][0] : nom.slice(0, 2)).toUpperCase();
}

// ── Les pages du bureau ─────────────────────────────────────────────────────

/**
 * Combien d'icônes tient une page du bureau : 4 × 4 sur téléphone, 6 × 3
 * sur grand écran. La grille CSS (`.accueil-page`) a les mêmes dimensions ;
 * si l'un change sans l'autre, une page déborde ou reste à moitié vide.
 */
export const ICONES_PAR_PAGE = { telephone: 16, ecran: 18 } as const;

/** Découpe les icônes en pages qu'on fait glisser, comme sur un téléphone. */
export function enPages<T>(icones: readonly T[], parPage: number): T[][] {
  if (parPage < 1) return [[...icones]];
  const pages: T[][] = [];
  for (let i = 0; i < icones.length; i += parPage) pages.push(icones.slice(i, i + parPage));
  return pages.length > 0 ? pages : [[]];
}

// ── La barre des tâches ─────────────────────────────────────────────────────

/** Une application ouverte, et l'endroit exact où on l'a laissée. */
export interface Tache {
  id: string;
  url: string;
}

/**
 * Au-delà, la plus ancienne se ferme : une barre qui déborde ne sert plus à
 * retrouver quoi que ce soit, surtout sur un téléphone.
 */
export const MAX_TACHES = 6;

/**
 * Ouvrir une application, ou y revenir. Une application déjà ouverte garde
 * sa place dans la barre — elle ne saute pas en tête à chaque clic, sinon on
 * ne la retrouve jamais au même endroit — et retient la nouvelle adresse.
 */
export function ouvrir(taches: readonly Tache[], id: string, url: string): Tache[] {
  if (taches.some((tache) => tache.id === id)) {
    return taches.map((tache) => (tache.id === id ? { id, url } : tache));
  }
  return [...taches, { id, url }].slice(-MAX_TACHES);
}

export function fermer(taches: readonly Tache[], id: string): Tache[] {
  return taches.filter((tache) => tache.id !== id);
}

/** Une adresse qu'on accepte de rouvrir : interne, et dans la bonne application. */
function adresseSure(tache: Tache): boolean {
  if (!tache.url.startsWith('/') || tache.url.startsWith('//')) return false;
  const chemin = tache.url.split(/[?#]/)[0];
  return applicationDe(chemin)?.id === tache.id;
}

// ── Mémoire ─────────────────────────────────────────────────────────────────
//
// Dans le navigateur, pas sur le serveur : ce qui est ouvert est l'état d'un
// appareil, comme les fenêtres d'un ordinateur. Le bureau, lui — ce qu'on a
// ajouté ou retiré — est enregistré sur le compte et suit la personne.

export const CLE_TACHES = 'ignitux.taches';
/** Émis quand la barre change hors du composant (le bureau retire une application). */
export const EVENEMENT_TACHES = 'ignitux:taches';

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function lireTaches(stockage: Stockage | null): Tache[] {
  try {
    const brut = stockage?.getItem(CLE_TACHES);
    if (!brut) return [];
    const valeur: unknown = JSON.parse(brut);
    if (!Array.isArray(valeur)) return [];
    const vues = new Set<string>();
    return valeur
      .filter(
        (t): t is Tache =>
          typeof t === 'object' &&
          t !== null &&
          typeof (t as Tache).id === 'string' &&
          typeof (t as Tache).url === 'string',
      )
      .filter((t) => adresseSure(t) && !vues.has(t.id) && !!vues.add(t.id))
      .map(({ id, url }) => ({ id, url }))
      .slice(-MAX_TACHES);
  } catch {
    // Mémoire illisible ou refusée (navigation privée) : on repart d'une
    // barre vide plutôt que de casser l'écran.
    return [];
  }
}

export function ecrireTaches(stockage: Stockage | null, taches: readonly Tache[]): void {
  try {
    if (taches.length === 0) stockage?.removeItem(CLE_TACHES);
    else stockage?.setItem(CLE_TACHES, JSON.stringify(taches));
  } catch {
    // Sans mémoire, la barre vit le temps de la page. Rien d'autre ne casse.
  }
}

export function stockageNavigateur(): Stockage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Fermer une tâche depuis n'importe quel écran (le bureau, quand on retire une application). */
export function fermerTache(id: string): void {
  const stockage = stockageNavigateur();
  ecrireTaches(stockage, fermer(lireTaches(stockage), id));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_TACHES));
}
