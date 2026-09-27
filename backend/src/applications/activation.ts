/**
 * LE MOTEUR D'ACTIVATION — ce qu'une personne voit en ouvrant Ignitux.
 *
 * Une fonction pure : elle reçoit ce qu'on sait de la personne et rend trois
 * listes. Pas de base, pas d'horloge, pas d'IA. C'est ce qui permet de
 * vérifier, exemple par exemple, que le restaurateur ne voit pas un
 * portefeuille d'investisseur et que l'investisseur ne voit pas une
 * facturation.
 *
 * ── Les trois règles ─────────────────────────────────────────────────────
 *
 * 1. **Ce qu'on utilise déjà est toujours là.** Une application dans
 *    laquelle la personne a écrit n'est jamais rétrogradée en suggestion.
 *    Un compte existant retrouve donc tout ce qu'il avait le jour où le
 *    lanceur remplace le menu.
 *
 * 2. **On suggère une chose à la fois, au bon moment.** La facturation est
 *    proposée quand il y a des contacts, la comptabilité quand il y a des
 *    factures. Proposer tout d'emblée, c'est refaire le menu de vingt
 *    entrées sous un autre nom.
 *
 * 3. **Rien n'est activé en silence.** Une suggestion reste une suggestion
 *    tant que la personne ne s'en est pas servie ; elle l'ouvre d'un clic,
 *    et c'est l'usage qui la fait passer dans ses applications.
 *
 * ── Et au-dessus des trois : le choix de la personne ─────────────────────
 *
 * Le bureau est à elle. Une application qu'elle **ajoute** depuis la
 * boutique y est, même hors de ses rôles ; une application qu'elle
 * **retire** n'y est plus, même utilisée, et IGINI cesse de la proposer.
 * Retirer n'efface rien — une application ne possède aucune donnée — et la
 * boutique la rend d'un geste. Les réglages ne se retirent pas : sans eux,
 * on ne pourrait plus rien changer.
 */
import type { RoleId } from '../roles/roles-catalogue.js';
import {
  APPLICATIONS,
  type Application,
  type ApplicationId,
  type Categorie,
  type Signal,
} from './applications-catalogue.js';

export interface ContexteActivation {
  /** Les rôles tenus. Vide = compte antérieur aux rôles. */
  roles: readonly RoleId[];
  /** Ce que la personne a déjà écrit, compté par nature. */
  usage: Readonly<Record<Signal, number>>;
  /** Les secteurs de ses projets (`projects.sector`), sans doublon. */
  secteurs: readonly string[];
  /** Son offre couvre-t-elle les outils de gestion ? */
  outilsDeGestion: boolean;
  /** Ce qu'elle a ajouté à son bureau, ou retiré. Absent = rien choisi. */
  choix?: Readonly<Partial<Record<ApplicationId, ChoixBureau>>>;
}

/** Ce que la personne a décidé pour une application de son bureau. */
export type ChoixBureau = 'ajoutee' | 'retiree';

export function estChoixBureau(valeur: unknown): valeur is ChoixBureau {
  return valeur === 'ajoutee' || valeur === 'retiree';
}

/**
 * Une application qu'on peut poser sur son bureau ou en retirer : elle
 * existe, et ce n'est pas un réglage.
 */
export function estRangeable(app: Application): boolean {
  return app.statut === 'disponible' && app.categorie !== 'reglages';
}

export interface ApplicationVue {
  id: ApplicationId;
  nom: string;
  resume: string;
  categorie: Categorie;
  route: string | null;
  /**
   * Hors de l'offre actuelle. Dit, jamais caché : la décision d'y donner
   * accès ou non appartient aux gardes du serveur, pas au lanceur.
   */
  horsOffre: boolean;
}

export interface Suggestion extends ApplicationVue {
  /** Pourquoi maintenant — une phrase complète. */
  raison: string;
}

export interface Prevue extends ApplicationVue {
  /** Pensée pour l'un des secteurs de ses projets. */
  pourToi: boolean;
  cadre: string | null;
}

export interface Lanceur {
  /** Au premier plan : ce qui sert, ou ce qui est le cœur du rôle. */
  applications: ApplicationVue[];
  /** Proposées maintenant, avec leur raison. Au plus `MAX_SUGGESTIONS`. */
  suggestions: Suggestion[];
  /** Les réglages : toujours là, jamais au premier plan. */
  reglages: ApplicationVue[];
  /** Nommées, pas ouvertes. Celles pensées pour la personne d'abord. */
  prevues: Prevue[];
  /**
   * La boutique : chaque application disponible qui n'est pas sur le
   * bureau, pour l'y ajouter. Suggérées comprises — une suggestion est une
   * proposition d'IGINI, la boutique est le choix de la personne.
   */
  boutique: ApplicationVue[];
  /**
   * Les rôles retenus pour le calcul. Un compte sans rôle est traité en
   * entrepreneur — c'est ce que l'ancien menu lui montrait — et le lanceur
   * le dit.
   */
  rolesRetenus: RoleId[];
}

/**
 * Deux, pas plus : au-delà, une liste de suggestions redevient un menu, et
 * l'œil saute par-dessus. Les suivantes viennent quand les premières servent.
 */
export const MAX_SUGGESTIONS = 2;

function vue(app: Application, contexte: ContexteActivation): ApplicationVue {
  return {
    id: app.id,
    nom: app.nom,
    resume: app.resume,
    categorie: app.categorie,
    route: app.route,
    horsOffre: app.offre === 'outilsDeGestion' && !contexte.outilsDeGestion,
  };
}

function concerne(app: Application, roles: readonly RoleId[]): boolean {
  return app.publics.length === 0 || app.publics.some((role) => roles.includes(role));
}

export function lanceur(contexte: ContexteActivation): Lanceur {
  const rolesRetenus: RoleId[] =
    contexte.roles.length > 0 ? [...contexte.roles] : ['entrepreneur'];

  const applications: ApplicationVue[] = [];
  const suggestions: Suggestion[] = [];
  const reglages: ApplicationVue[] = [];
  const prevues: Prevue[] = [];
  const boutique: ApplicationVue[] = [];
  const choix = contexte.choix ?? {};

  for (const app of APPLICATIONS) {
    if (estRangeable(app)) {
      if (choix[app.id] === 'retiree') {
        boutique.push(vue(app, contexte));
        continue;
      }
      if (choix[app.id] === 'ajoutee') {
        applications.push(vue(app, contexte));
        continue;
      }
    }

    if (app.statut === 'prevue') {
      if (!concerne(app, rolesRetenus)) continue;
      prevues.push({
        ...vue(app, contexte),
        route: null,
        pourToi: app.secteurs.some((secteur) => contexte.secteurs.includes(secteur)),
        cadre: app.cadre,
      });
      continue;
    }

    if (app.categorie === 'reglages') {
      reglages.push(vue(app, contexte));
      continue;
    }

    // Règle 1 : une application utilisée est à soi, même hors de ses rôles
    // — quelqu'un qui a retiré le rôle entrepreneur garde l'accès visible à
    // ses factures, parce qu'elles existent.
    const utilisee = app.signal !== null && contexte.usage[app.signal] > 0;
    if (utilisee) {
      applications.push(vue(app, contexte));
      continue;
    }

    if (concerne(app, rolesRetenus) && app.essentielle) {
      applications.push(vue(app, contexte));
      continue;
    }

    // Pas sur le bureau : la boutique la propose, qu'elle soit de ses rôles
    // ou non — c'est à la personne de dire ce qui la concerne.
    boutique.push(vue(app, contexte));
    if (!concerne(app, rolesRetenus)) continue;

    // Règle 2 : proposée seulement quand l'étape d'avant est franchie, et,
    // pour une application pensée pour certains secteurs, seulement à ceux-là
    // — suggérer un suivi de stock à un projet de logiciel ne servirait à
    // rien, même une fois qu'il a un premier projet.
    const pourSonSecteur =
      app.secteurs.length === 0 || app.secteurs.some((secteur) => contexte.secteurs.includes(secteur));
    const pret = pourSonSecteur && (app.apres === null || contexte.usage[app.apres] > 0);
    if (pret && app.pourquoi && suggestions.length < MAX_SUGGESTIONS) {
      suggestions.push({ ...vue(app, contexte), raison: app.pourquoi });
    }
  }

  // Ce qui est pensé pour ses secteurs passe devant ; l'ordre du catalogue
  // départage le reste.
  prevues.sort((a, b) => Number(b.pourToi) - Number(a.pourToi));

  return { applications, suggestions, reglages, prevues, boutique, rolesRetenus };
}
