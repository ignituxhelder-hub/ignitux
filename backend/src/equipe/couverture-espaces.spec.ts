import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DOMAINE_PAR_MODULE, type Domaine } from './domaines.js';
import { ESPACE_DOMAINE, HORS_ESPACE } from './espace.decorator.js';

/**
 * COUVERTURE DES ESPACES — aucune route authentifiée n'est laissée au hasard.
 *
 * Repris de `feat/equipe`, réduit à l'espace argent (spec 2026-10-14).
 * Parcourt TOUS les fichiers `*.controller.ts` de `src/` ; chaque route
 * protégée par `JwtAuthGuard` tombe dans exactement une de ces classes :
 *
 * - `@Espace('argent')` : données de l'espace sélectionné — UNIQUEMENT dans
 *   les quatre modules d'argent (billing, ledger, banking, caisse), et TOUTES
 *   leurs routes authentifiées sauf les `@HorsEspace()` admises ;
 * - `@HorsEspace()` : l'en-tête est ignoré (route qui ne lit ni n'écrit les
 *   données d'un espace) — chacune listée ci-dessous avec sa raison ;
 * - rien : « refusée en espace étranger ». L'intercepteur global
 *   (`EspaceInterceptor`) répond 403 à toute requête qui y porte un
 *   `X-Espace` étranger — fermé par défaut, vérifié en HTTP par
 *   `espaces-argent.http.spec.ts`.
 *
 * Une route d'argent ajoutée sans `@Espace`, ou un `@Espace` posé hors des
 * quatre modules, échoue ici.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
/** La table du client : les routes qui portent `X-Espace` dans l'espace d'un autre. */
const DOMAINES_FRONT = join(SRC, '..', '..', 'frontend', 'src', 'lib', 'domaines.ts');

interface Route {
  fichier: string;
  module: string;
  controleur: string;
  methode: string;
  verbe: string;
  chemin: string;
  authentifiee: boolean;
  domaine: Domaine | undefined;
  horsEspace: boolean;
}

/** Les routes `@HorsEspace()` admises, et pourquoi. */
const HORS_ESPACE_ADMIS: Record<string, string> = {
  'EspacesController.mesEspaces': 'liste MES espaces, quel que soit celui sélectionné',
  'BillingController.getLegalNotice': 'notice légale fixe, aucune donnée',
};

/** Les routes sans connexion, connues. Une nouvelle route publique doit s'ajouter ici, consciemment. */
const PUBLIQUES = new Set([
  'AppController.getHello',
  'AppController.getHealth',
  'AppController.getMentionsLegales',
  'ApplicationsController.catalogue',
  'AuthController.login',
  'AuthController.refresh',
  'AuthController.logout',
  'AuthTokensController.forgotPassword',
  'AuthTokensController.resetPassword',
  'AuthTokensController.verifyEmail',
  'AuthTokensController.resendVerification',
  'BoutiqueEnLigneCallbackController.callback',
  'ConstitutionController.getPreamble',
  'ConstitutionController.listArticles',
  'ConstitutionController.listRules',
  // Le barème des crédits : les prix que la page d'accueil affiche, sans connexion.
  'CreditsController.bareme',
  'IginiStatusController.getStatus',
  // Retour de connexion Instagram / TikTok : le navigateur y arrive depuis
  // le réseau, sans jeton Ignitux. La personne est reconnue par l'état
  // OAuth signé (HMAC, 10 minutes), comme pour Shopify ci-dessus.
  'PublicationsSocialesController.callback',
  'ReadinessController.ready',
  'RolesController.catalogue',
  'UsersController.signup',
  // Le compteur de projets de la page d'accueil : un nombre arrondi, ou rien
  // sous 50 (voir vitrine.service.ts).
  'VitrineController.compteur',
]);

function fichiersControleurs(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === 'generated' ? [] : fichiersControleurs(chemin);
    return entree.name.endsWith('.controller.ts') ? [chemin] : [];
  });
}

function gardes(cible: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, cible) as unknown[] | undefined) ?? [];
}

async function routes(): Promise<Route[]> {
  const toutes: Route[] = [];
  for (const fichier of fichiersControleurs(SRC)) {
    const rel = relative(SRC, fichier).split(sep).join('/');
    const module = rel.split('/')[0];
    const exports = (await import(pathToFileURL(fichier).href)) as Record<string, unknown>;
    for (const [nom, valeur] of Object.entries(exports)) {
      if (typeof valeur !== 'function' || Reflect.getMetadata(PATH_METADATA, valeur) === undefined) continue;
      const classe = valeur as { prototype: Record<string, unknown> };
      for (const methode of Object.getOwnPropertyNames(classe.prototype)) {
        const fn = classe.prototype[methode];
        if (methode === 'constructor' || typeof fn !== 'function') continue;
        const verbe = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
        if (verbe === undefined) continue;
        const chaine = [...gardes(valeur), ...gardes(fn)];
        toutes.push({
          fichier: rel,
          module,
          controleur: nom,
          methode,
          verbe: RequestMethod[verbe],
          chemin: `/${[Reflect.getMetadata(PATH_METADATA, valeur), Reflect.getMetadata(PATH_METADATA, fn)]
            .filter((p) => p && p !== '/')
            .join('/')}`,
          authentifiee: chaine.includes(JwtAuthGuard),
          domaine: Reflect.getMetadata(ESPACE_DOMAINE, fn) as Domaine | undefined,
          horsEspace:
            Reflect.getMetadata(HORS_ESPACE, fn) === true || Reflect.getMetadata(HORS_ESPACE, valeur) === true,
        });
      }
    }
  }
  return toutes;
}

const decrire = (r: Route) => `${r.controleur}.${r.methode} (${r.verbe} ${r.chemin}, ${r.fichier})`;
const cle = (r: Route) => `${r.controleur}.${r.methode}`;

describe('Couverture des espaces : chaque route authentifiée est classée', () => {
  let toutes: Route[];

  beforeAll(async () => {
    toutes = await routes();
  }, 60_000);

  it('trouve bien tous les contrôleurs (le parcours ne passe pas à côté)', () => {
    const controleurs = new Set(toutes.map((r) => r.controleur));
    expect(controleurs.size).toBeGreaterThanOrEqual(40);
    expect(toutes.length).toBeGreaterThan(250);
    for (const attendu of ['BillingController', 'LedgerController', 'BankingController', 'CaisseController']) {
      expect(controleurs).toContain(attendu);
    }
  });

  it('SEULS les quatre modules d’argent portent @Espace, et toujours « argent »', () => {
    const ecarts = toutes
      .filter((r) => r.domaine !== undefined && (r.domaine !== 'argent' || DOMAINE_PAR_MODULE[r.module] !== 'argent'))
      .map(decrire);
    expect(ecarts).toEqual([]);
    const modules = new Set(toutes.filter((r) => r.domaine).map((r) => r.module));
    expect([...modules].sort()).toEqual(['banking', 'billing', 'caisse', 'ledger']);
  });

  it('chaque route authentifiée des modules d’argent porte @Espace(\'argent\') (ou est hors espace admise)', () => {
    const oubliees = toutes
      .filter((r) => r.authentifiee && r.module in DOMAINE_PAR_MODULE && !r.domaine && !r.horsEspace)
      .map(decrire);
    expect(oubliees).toEqual([]);
  });

  it('l’audit financier reste une capacité de projet (livraison 1), pas une route d’espace', () => {
    const audit = toutes.filter((r) => r.module === 'finance-audit');
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.filter((r) => r.domaine || r.horsEspace).map(decrire)).toEqual([]);
  });

  it('les routes du propriétaire sur SON équipe (journal, accès à son argent) ne portent aucune marque', () => {
    // Sans marque = refusées (403) avec l'espace d'un autre : un membre ne
    // lit ni ne change jamais les choix d'un propriétaire en se plaçant dans
    // son espace.
    const attendues = [
      'EspacesController.activite',
      'EspacesController.accesArgent',
      'EspacesController.choisirAccesArgent',
    ];
    const trouvees = toutes.filter((r) => attendues.includes(cle(r)));
    expect(trouvees.map(cle).sort()).toEqual([...attendues].sort());
    expect(trouvees.filter((r) => !r.authentifiee || r.domaine || r.horsEspace).map(decrire)).toEqual([]);
  });

  it('les crédits sont personnels : refusés en espace étranger, sans aucune marque', () => {
    // Un membre ne lit ni ne change le solde d'un propriétaire en se plaçant
    // dans son espace ; l'administration non plus. Seul le barème est public.
    const attendues = [
      'CreditsController.vue',
      'AdminCreditsController.comptes',
      'AdminCreditsController.ajuster',
    ];
    const trouvees = toutes.filter((r) => attendues.includes(cle(r)));
    expect(trouvees.map(cle).sort()).toEqual([...attendues].sort());
    expect(trouvees.filter((r) => !r.authentifiee || r.domaine || r.horsEspace).map(decrire)).toEqual([]);
  });

  it('une seule marque par route (jamais @Espace et @HorsEspace ensemble)', () => {
    expect(toutes.filter((r) => r.domaine && r.horsEspace).map(decrire)).toEqual([]);
  });

  it('les routes @HorsEspace sont exactement celles admises (avec leur raison)', () => {
    const horsEspace = toutes.filter((r) => r.horsEspace).map(cle);
    expect(horsEspace.sort()).toEqual(Object.keys(HORS_ESPACE_ADMIS).sort());
  });

  it('tout le reste est « refusé en espace étranger » (fermé par défaut, sans marque)', () => {
    const refusees = toutes.filter((r) => r.authentifiee && !r.domaine && !r.horsEspace);
    // Les routes d'argent sont une petite minorité : tout le reste refuse.
    expect(refusees.length).toBeGreaterThan(200);
    expect(refusees.filter((r) => r.module in DOMAINE_PAR_MODULE).map(decrire)).toEqual([]);
  });

  /**
   * ALIGNEMENT CLIENT ↔ SERVEUR. Le client (`frontend/src/lib/domaines.ts`,
   * `ROUTES_PAR_DOMAINE`) décide quelles routes portent `X-Espace`. Une
   * route @Espace absente côté client partirait sans en-tête (le membre
   * verrait ses propres données en croyant voir celles du propriétaire) ;
   * une route du client que le serveur ne délègue pas serait refusée (403).
   * Les deux tables doivent donc être identiques. Les noms de paramètres
   * (`:id` / `:documentId`) ne comptent pas.
   */
  it.skipIf(!existsSync(DOMAINES_FRONT))(
    'la table du client (ROUTES_PAR_DOMAINE) est exactement celle des routes @Espace du serveur',
    async () => {
      const { ROUTES_PAR_DOMAINE } = (await import(pathToFileURL(DOMAINES_FRONT).href)) as {
        ROUTES_PAR_DOMAINE: Record<string, readonly string[]>;
      };
      const sansNomsDeParametres = (chemin: string) => chemin.replace(/:[^/]+/g, ':');
      const serveur = new Set(
        toutes.filter((r) => r.domaine).map((r) => `${r.domaine} ${sansNomsDeParametres(r.chemin)}`),
      );
      const client = new Set(
        Object.entries(ROUTES_PAR_DOMAINE).flatMap(([domaine, chemins]) =>
          chemins.map((c) => `${domaine} ${sansNomsDeParametres(c)}`),
        ),
      );
      expect([...serveur].filter((r) => !client.has(r)).sort()).toEqual([]);
      expect([...client].filter((r) => !serveur.has(r)).sort()).toEqual([]);
    },
  );

  it('les routes sans connexion sont exactement celles connues, et aucune ne lit l’espace', () => {
    const publiques = toutes.filter((r) => !r.authentifiee);
    expect(publiques.map(cle).sort()).toEqual([...PUBLIQUES].sort());
    // @Espace sans JwtAuthGuard répondrait toujours 403 « Espace indéterminable ».
    expect(publiques.filter((r) => r.domaine).map(decrire)).toEqual([]);
  });
});
