/**
 * LE CATALOGUE DES APPLICATIONS — ce qu'Ignitux sait faire, rangé comme on
 * range les applications d'un téléphone.
 *
 * Jusqu'ici le produit se présentait comme un menu de pages. Une personne
 * qui ouvre un restaurant n'a que faire d'un portefeuille d'investisseur, et
 * un investisseur n'a que faire d'une facturation : le menu les montrait
 * quand même. Le catalogue décrit chaque application une fois ; le moteur
 * d'activation (`activation.ts`) décide ensuite, personne par personne, ce
 * qui apparaît.
 *
 * Le catalogue vit dans le code et non en base, pour la même raison que les
 * rôles et les offres : une application est une brique de produit qu'on
 * relit, pas une donnée qu'on saisit.
 *
 * Une application **ne possède aucune donnée**. Les factures appartiennent à
 * la personne, pas à l'application Facturation. Masquer une application ne
 * supprime donc rien, et la retrouver rend tout — même règle que les rôles.
 */
import type { RoleId } from '../roles/roles-catalogue.js';

export const APPLICATION_IDS = [
  'parcours',
  'relations',
  'facturation',
  'comptabilite',
  'banque',
  'portefeuille',
  'communaute',
  'reseau',
  'profil',
  'offres',
  'consommation-ia',
  'constitution',
  'compte',
  'caisse',
  'stocks',
  'agenda',
  'immobilier',
  'vehicules',
  'publicite',
  'equipe',
] as const;

export type ApplicationId = (typeof APPLICATION_IDS)[number];

export type Categorie = 'creer' | 'vendre' | 'gerer' | 'investir' | 'reseau' | 'reglages';

/**
 * Ce qui montre qu'une personne se sert déjà d'une application.
 *
 * Une application dans laquelle on a déjà écrit n'est jamais « suggérée » :
 * elle est à soi. C'est ce qui garantit qu'un compte existant retrouve tout
 * ce qu'il utilisait le jour où le lanceur remplace le menu.
 */
export type Signal =
  | 'projets'
  | 'contacts'
  | 'documents'
  | 'ecritures'
  | 'comptesBancaires'
  | 'investissements';

export interface Application {
  id: ApplicationId;
  nom: string;
  /** Ce que l'application fait, en une phrase, reprise telle quelle à l'écran. */
  resume: string;
  categorie: Categorie;
  /**
   * `disponible` : l'application existe et s'ouvre.
   * `prevue` : elle est pensée, rien n'existe derrière. On la nomme parce
   * que dire « pas encore » est plus honnête que de la cacher — et on ne
   * l'ouvre jamais sur un écran vide.
   */
  statut: 'disponible' | 'prevue';
  /** Où elle s'ouvre. null tant qu'elle est prévue. */
  route: string | null;
  /**
   * Les rôles pour qui elle a un sens. Vide = pour tout le monde.
   *
   * Une application hors de ses rôles n'apparaît pas au lanceur, mais sa
   * page reste accessible par son adresse : le lanceur range, il ne garde
   * pas de porte. Les droits restent au serveur, route par route.
   */
  publics: readonly RoleId[];
  /**
   * Toujours présente pour ceux à qui elle s'adresse, sans avoir à être
   * suggérée — le cœur d'un rôle, ou un réglage.
   */
  essentielle: boolean;
  /** Ce qui montre qu'elle sert déjà. null = aucun signal ne s'applique. */
  signal: Signal | null;
  /**
   * Pourquoi IGINI la propose, quand elle n'est pas encore utilisée.
   * Une phrase complète : elle est lue sans le reste de l'écran.
   */
  pourquoi: string | null;
  /**
   * Suggérée seulement quand ce signal est déjà présent. Proposer une
   * comptabilité à quelqu'un qui n'a encore rien facturé, c'est ajouter une
   * icône avant qu'elle serve.
   */
  apres: Signal | null;
  /** La capacité d'offre qu'elle demande, s'il y en a une. */
  offre: 'outilsDeGestion' | null;
  /**
   * Les secteurs de projet (`projects.sector`) pour qui elle compte le plus.
   * Vide = tous. Sert à dire « prévue, et pensée pour toi ».
   */
  secteurs: readonly string[];
  /**
   * Un cadre légal qui décide de la façon de la construire. Affiché à côté
   * de « prévue » pour que personne ne prenne un délai pour de l'oubli.
   */
  cadre: string | null;
}

export const APPLICATIONS: readonly Application[] = [
  // ── Le cœur de l'entrepreneur ─────────────────────────────────────────
  {
    id: 'parcours',
    nom: 'Mes projets',
    resume:
      'Décrire une idée, la faire analyser par IGINI, et la mener pas à pas : construire, ' +
      'financer, développer, transmettre.',
    categorie: 'creer',
    statut: 'disponible',
    route: '/projects',
    publics: ['entrepreneur'],
    essentielle: true,
    signal: 'projets',
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'relations',
    nom: 'Relations',
    resume: 'Tes clients, prospects et partenaires, et ce que tu as échangé avec chacun.',
    categorie: 'vendre',
    statut: 'disponible',
    route: '/crm',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: 'contacts',
    pourquoi:
      'Tu as un projet : note ici tes premiers clients et prospects, pour ne perdre le fil ' +
      "d'aucune conversation.",
    apres: 'projets',
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'facturation',
    nom: 'Facturation',
    resume: 'Devis et factures conformes, numérotés sans trou, et les paiements reçus.',
    categorie: 'vendre',
    statut: 'disponible',
    route: '/facturation',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: 'documents',
    pourquoi:
      'Tu as des contacts : quand l’un d’eux te demande un prix, le devis se prépare ici, ' +
      'et la facture suit en un clic.',
    apres: 'contacts',
    offre: 'outilsDeGestion',
    secteurs: [],
    cadre: null,
  },
  {
    id: 'comptabilite',
    nom: 'Comptabilité',
    resume: 'Le grand livre, tenu en partie double, et ce que ton activité rapporte vraiment.',
    categorie: 'gerer',
    statut: 'disponible',
    route: '/comptabilite',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: 'ecritures',
    pourquoi:
      'Tu factures déjà : la comptabilité reprend tes factures et te montre ce qui reste ' +
      'une fois tout payé.',
    apres: 'documents',
    offre: 'outilsDeGestion',
    secteurs: [],
    cadre: null,
  },
  {
    id: 'banque',
    nom: 'Banque',
    resume: 'Tes comptes et leurs mouvements, rapprochés de tes factures.',
    categorie: 'gerer',
    statut: 'disponible',
    route: '/banque',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: 'comptesBancaires',
    pourquoi:
      'Tu tiens une comptabilité : relie ton compte pour voir quelles factures sont ' +
      'réellement payées.',
    apres: 'ecritures',
    offre: 'outilsDeGestion',
    secteurs: [],
    cadre: null,
  },

  // ── Le cœur de l'investisseur ─────────────────────────────────────────
  {
    id: 'portefeuille',
    nom: 'Portefeuille',
    resume:
      'Chaque projet dans lequel tu as placé de l’argent, séparément : investi, remboursé, ' +
      'dividendes, part détenue.',
    categorie: 'investir',
    statut: 'disponible',
    route: '/investisseur',
    publics: ['investisseur'],
    essentielle: true,
    signal: 'investissements',
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },

  // ── Pour tout le monde ────────────────────────────────────────────────
  {
    id: 'communaute',
    nom: 'Communauté',
    resume: 'Les projets que d’autres ont rendus publics, et les encouragements.',
    categorie: 'reseau',
    statut: 'disponible',
    route: '/community',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'reseau',
    nom: 'Mentors & investisseurs',
    resume: 'Trouver quelqu’un qui a déjà fait ce que tu fais, ou qui peut le financer.',
    categorie: 'reseau',
    statut: 'disponible',
    route: '/marketplace',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },

  // ── Réglages : toujours là, jamais au premier plan ───────────────────
  {
    id: 'profil',
    nom: 'Mon profil',
    resume: 'Ce que tu dis de toi, et ce que chaque réponse change pour IGINI.',
    categorie: 'reglages',
    statut: 'disponible',
    route: '/profil',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'offres',
    nom: 'Mon offre',
    resume: 'Ce que ton offre couvre, et ce que la suivante ouvrirait.',
    categorie: 'reglages',
    statut: 'disponible',
    route: '/offres',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'consommation-ia',
    nom: 'Consommation IA',
    resume: 'Ce que tes demandes à IGINI ont coûté, appel par appel.',
    categorie: 'reglages',
    statut: 'disponible',
    route: '/consommation-ia',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'constitution',
    nom: 'Constitution',
    resume: 'Les règles qu’Ignitux s’impose, et celles que le code vérifie.',
    categorie: 'reglages',
    statut: 'disponible',
    route: '/constitution',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'compte',
    nom: 'Mon compte',
    resume: 'Adresse, mot de passe, rôles, export et suppression de tes données.',
    categorie: 'reglages',
    statut: 'disponible',
    route: '/account',
    publics: [],
    essentielle: true,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre: null,
  },
  {
    id: 'stocks',
    nom: 'Stocks',
    resume: 'Ce que tu as en réserve, ce qui part, et quand recommander.',
    categorie: 'gerer',
    statut: 'disponible',
    route: '/stocks',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: null,
    pourquoi:
      'Tu as un projet : suis ici ce que tu as en réserve, pour ne jamais te retrouver à ' +
      'court sans l’avoir vu venir.',
    apres: 'projets',
    offre: 'outilsDeGestion',
    secteurs: ['Restauration', 'Commerce', 'Artisanat', 'Industrie', 'Agriculture'],
    cadre: null,
  },

  // ── Prévues : nommées, jamais ouvertes sur du vide ────────────────────
  {
    id: 'caisse',
    nom: 'Caisse',
    resume: 'Le relevé de ta caisse certifiée, saisi une fois par jour, et qui rejoint ta compta automatiquement.',
    categorie: 'vendre',
    statut: 'disponible',
    route: '/caisse',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: null,
    pourquoi:
      'Tu as un projet : enregistre ici le relevé de ta caisse certifiée, pour qu’il rejoigne ' +
      'ta comptabilité sans ressaisie.',
    apres: 'projets',
    offre: 'outilsDeGestion',
    secteurs: ['Restauration', 'Commerce', 'Artisanat'],
    cadre:
      'Un logiciel de caisse doit être certifié en France (art. 286 I 3° bis du CGI) : elle ' +
      "s'appuiera sur une solution certifiée plutôt que d'en réinventer une.",
  },
  {
    id: 'agenda',
    nom: 'Agenda',
    resume: 'Tes rendez-vous clients, et les échéances qu’IGINI te rappelle.',
    categorie: 'gerer',
    statut: 'disponible',
    route: '/agenda',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: null,
    pourquoi:
      'Tu as des contacts : note ici tes rendez-vous avec eux, pour ne plus en manquer aucun.',
    apres: 'contacts',
    offre: null,
    secteurs: ['Services', 'Santé', 'Éducation', 'Logiciel'],
    cadre: null,
  },
  {
    id: 'equipe',
    nom: 'Équipe',
    resume: 'Inviter des associés et des salariés, chacun avec ce qu’il doit voir.',
    categorie: 'gerer',
    statut: 'prevue',
    route: null,
    publics: ['entrepreneur'],
    essentielle: false,
    signal: null,
    pourquoi: null,
    apres: null,
    offre: null,
    secteurs: [],
    cadre:
      'La paie ne sera pas refaite ici : les déclarations sociales passeront par un ' +
      'fournisseur agréé.',
  },
  {
    id: 'immobilier',
    nom: 'Immobilier',
    resume: 'Tes biens, leurs loyers, leurs charges et leurs baux.',
    categorie: 'investir',
    statut: 'disponible',
    route: '/immobilier',
    publics: ['entrepreneur', 'investisseur'],
    essentielle: false,
    signal: null,
    pourquoi:
      'Tu as un projet dans l’immobilier : suis ici tes biens, leurs loyers perçus et leurs ' +
      'charges payées.',
    apres: 'projets',
    offre: null,
    secteurs: ['Immobilier'],
    cadre: null,
  },
  {
    id: 'vehicules',
    nom: 'Véhicules',
    resume: 'Ta flotte, son entretien, ses coûts au kilomètre.',
    categorie: 'gerer',
    statut: 'disponible',
    route: '/vehicules',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: null,
    pourquoi:
      'Tu as un projet dans le transport : suis ici l’entretien de ta flotte et son coût au ' +
      'kilomètre.',
    apres: 'projets',
    offre: null,
    secteurs: ['Transport'],
    cadre: null,
  },
  {
    id: 'publicite',
    nom: 'Publicité',
    resume: 'Tes campagnes, ce qu’elles coûtent, et les clients qu’elles amènent.',
    categorie: 'vendre',
    statut: 'disponible',
    route: '/publicite',
    publics: ['entrepreneur'],
    essentielle: false,
    signal: null,
    pourquoi:
      'Tu as des contacts : suis ici tes campagnes, ce qu’elles coûtent et les prospects ' +
      'qu’elles amènent.',
    apres: 'contacts',
    offre: null,
    secteurs: [],
    cadre: null,
  },
];

const PAR_ID = new Map<string, Application>(APPLICATIONS.map((app) => [app.id, app]));

export function findApplication(id: string): Application | undefined {
  return PAR_ID.get(id);
}
