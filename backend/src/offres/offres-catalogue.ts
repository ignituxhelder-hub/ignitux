/**
 * LES OFFRES — ce qu'on vend, et ce qu'on refuse de vendre.
 *
 * Module pur : aucune base, aucun Nest. Tout le raisonnement tient ici et
 * s'éprouve sans rien démarrer.
 *
 * ## La ligne de partage
 *
 * Ce n'est pas « fonctionnalités de base contre fonctionnalités avancées ».
 * C'est : **ce qui ne coûte rien à faire tourner est gratuit ; ce qui coûte
 * à chaque clic est payant.**
 *
 * Un appel aux générateurs coûte de l'argent réel à chaque fois. Une tâche
 * cochée, un concept relié, un score calculé, une démarche de conformité
 * lue : rien de tout cela n'a de coût marginal. Les enfermer derrière un
 * péage ferait payer pour de l'électricité qu'on ne consomme pas, et
 * priverait quelqu'un sans budget d'un produit qui marche très bien sans IA
 * — ce qui est précisément la promesse du parcours.
 *
 * ## Pourquoi les prix ne sont pas des constantes figées
 *
 * Ils sont ici comme **valeurs par défaut**, pas comme vérité. Un prix
 * change — une bêta, une promotion, un pays. Le jour où la table `plans`
 * existera, elle primera sur ce fichier ; d'ici là ces montants sont ce que
 * le produit affiche, et il vaut mieux qu'ils soient au même endroit que
 * les capacités qu'ils ouvrent, pour qu'un changement de prix ne laisse pas
 * les droits en arrière.
 *
 * ## Ce que ce module ne décide pas
 *
 * Il ne parle pas d'encaissement. Aucun fournisseur de paiement, aucune
 * TVA, aucune facture. Il répond à une seule question : « cette personne,
 * avec cette offre, a-t-elle le droit de faire ceci ? » Le reste est un
 * autre problème, et les mélanger rendrait les deux illisibles.
 */

/** Les abonnements. Le financement n'en est pas un — voir plus bas. */
export const OFFRES = ['decouverte', 'entrepreneur', 'construction'] as const;
export type OffreId = (typeof OFFRES)[number];

export function estOffre(valeur: string): valeur is OffreId {
  return (OFFRES as readonly string[]).includes(valeur);
}

/**
 * Ce qu'une offre autorise.
 *
 * Des clés, pas des phrases : c'est ce qu'un garde interroge. Les phrases
 * destinées aux humains vivent dans `resume` et `argument`.
 */
export interface Capacites {
  /** Nombre de projets simultanés. `null` = sans limite. */
  projets: number | null;
  /** Les cinq générateurs IGINI, nommément. Vide = aucun. */
  generateurs: readonly GeneratorName[];
  /** Appels aux générateurs par mois civil. `null` = sans limite. */
  appelsIaParMois: number | null;
  /** Les outils de gestion : comptabilité, facturation, banque. */
  outilsDeGestion: boolean;
  /** Ouvrir un projet au financement et tenir un registre d'investisseurs. */
  investisseurs: boolean;
  /** Collaborateurs invités par projet. `null` = sans limite, 0 = aucun. */
  collaborateurs: number | null;
}

/**
 * Les cinq générateurs, repris du journal de consommation plutôt que
 * redéclarés ici.
 *
 * Il y a eu deux listes pendant un moment — `analyse` ici, `analyser`
 * là-bas. Rien n'échouait : un droit se serait appliqué à un nom que
 * personne n'émettait, et le refus ne serait jamais venu.
 */
import { GENERATOR_NAMES, type GeneratorName } from '../igini/usage/generator-names.js';
export { GENERATOR_NAMES as GENERATEURS };
export type { GeneratorName as GenerateurId };

export interface Offre {
  id: OffreId;
  label: string;
  /** Le prix mensuel par défaut, en centimes. 0 = gratuit. */
  prixCentimes: number;
  /** Ce que l'offre permet de faire, en une phrase pour un humain. */
  resume: string;
  /**
   * Pourquoi on passerait à celle-ci depuis la précédente.
   *
   * `null` pour la première : il n'y a rien avant elle. Une offre gratuite
   * qui « argumente » son propre intérêt sonne comme une vente alors qu'il
   * n'y a rien à vendre.
   */
  argument: string | null;
  capacites: Capacites;
}

/**
 * Le catalogue.
 *
 * L'ordre compte : c'est celui de la progression, et `offreSuivante` s'en
 * sert. Une offre insérée au mauvais endroit changerait ce que le produit
 * propose à quelqu'un qui bute sur une limite.
 */
export const CATALOGUE: readonly Offre[] = [
  {
    id: 'decouverte',
    label: 'Découverte',
    prixCentimes: 0,
    resume:
      'Un projet, construit à la main, avec quelques analyses offertes pour voir ce ' +
      "qu'IGINI sait faire.",
    argument: null,
    capacites: {
      projets: 1,
      // Seule l'analyse : c'est elle qui donne le verdict de départ, et
      // c'est le seul générateur dont l'absence rendrait la découverte
      // creuse. Les quatre autres supposent qu'on a décidé de continuer.
      generateurs: ['analyser'],
      // Trois, pas une : une seule analyse rendrait impossible de retravailler
      // son idée et de la relancer, ce qui est exactement le geste qu'on
      // veut encourager. Trois laisse de la place à l'erreur.
      appelsIaParMois: 3,
      outilsDeGestion: false,
      investisseurs: false,
      collaborateurs: 0,
    },
  },
  {
    id: 'entrepreneur',
    label: 'Entrepreneur',
    prixCentimes: 990,
    resume:
      'Autant de projets que nécessaire, et les cinq générateurs pour passer de ' +
      "l'idée au plan.",
    argument:
      "Tu as vu ce que l'analyse donne. Construire, financer, développer et transmettre " +
      'sont les quatre étapes suivantes, et elles produisent des documents que tu ' +
      "n'aurais pas écrits seul.",
    capacites: {
      projets: null,
      generateurs: [...GENERATOR_NAMES],
      appelsIaParMois: 30,
      outilsDeGestion: false,
      investisseurs: false,
      collaborateurs: 0,
    },
  },
  {
    id: 'construction',
    label: 'Construction',
    prixCentimes: 5900,
    resume:
      'Tout ce qui précède, plus la comptabilité, la facturation, la banque, les ' +
      'investisseurs et les collaborateurs.',
    argument:
      "Une entreprise qui tourne ne se pilote plus dans un plan : elle facture, elle " +
      'tient ses comptes, elle rend des comptes à ceux qui l’ont financée.',
    capacites: {
      projets: null,
      generateurs: [...GENERATOR_NAMES],
      /*
       * 35 et non 150, depuis le 26 septembre 2026.
       *
       * Le catalogue vendait 150 analyses tandis que le plafond de coût par
       * utilisateur — `DEFAULT_COST_MICRO_EUR_PER_MONTH`, 2 €/mois — coupait
       * bien avant. Le produit ne mentait pas à l'usage : il nomme le plafond
       * qui mord (`analyses_selon`). Mais il vendait un chiffre qu'il ne
       * pouvait pas tenir, et la personne qui l'apprenait était celle qui
       * venait de payer.
       *
       * D'où vient 35, et pas un chiffre rond. Deux contraintes le serrent :
       *
       *   — le plafond de coût. 55 appels réels mesurés donnent 0,0511 € de
       *     moyenne ; 35 × 0,0511 = 1,79 €, sous les 2 €, avec de la marge.
       *     Le maximum théorique serait 39 ;
       *   — le catalogue lui-même. Un test exige qu'une offre plus chère ne
       *     donne JAMAIS moins que la précédente, et Entrepreneur en promet
       *     30. Descendre à 30 aurait cassé cette échelle : on aurait payé
       *     59 € pour le même quota que 9,90 €.
       *
       * Ce que 35 ne garantit PAS, et il vaut mieux l'écrire : l'appel le plus
       * cher observé coûte 0,0914 € (`construire`). Quelqu'un qui n'utiliserait
       * que celui-là serait coupé vers la 22ᵉ. L'offre Entrepreneur a
       * exactement la même propriété, et depuis plus longtemps — c'est le
       * plafond qui est commun aux deux, pas un défaut de cette offre-ci.
       *
       * Construction ne vend d'ailleurs pas des analyses : elle vend la
       * comptabilité, la facturation, la banque, les investisseurs et les
       * collaborateurs. Les trois lignes ci-dessous sont ce qu'on paie.
       */
      appelsIaParMois: 35,
      outilsDeGestion: true,
      investisseurs: true,
      collaborateurs: null,
    },
  },
];

/** L'offre par défaut : celle qu'on a sans rien faire, ni payer. */
export const OFFRE_PAR_DEFAUT: OffreId = 'decouverte';

/**
 * Le prix réellement appliqué, en centimes.
 *
 * `OFFRE_<ID>_PRIX_CENTIMES` prime sur la valeur du catalogue. Une bêta à
 * prix réduit, une promotion, un ajustement : tout cela se règle sans
 * redéployer, ce qui est le seul moyen de ne pas transformer un changement
 * de prix en chantier.
 *
 * Une valeur illisible ou négative retombe sur le catalogue plutôt que de
 * lever : un prix cassé ne doit pas empêcher le produit de s'afficher, et
 * surtout pas rendre quelque chose gratuit par accident de frappe.
 */
export function prixCentimes(id: OffreId): number {
  const base = CATALOGUE.find((o) => o.id === id) ?? CATALOGUE[0];
  const brut = process.env[`OFFRE_${id.toUpperCase()}_PRIX_CENTIMES`]?.trim();
  // Une variable vide n'est pas un prix de zéro : c'est une variable vide.
  // `Number('')` vaut 0, si bien qu'une ligne `OFFRE_..._PRIX_CENTIMES=`
  // laissée en place rendait l'offre gratuite. Le test l'a attrapé.
  if (brut === undefined || brut === '') return base.prixCentimes;

  const lu = Number(brut);
  if (!Number.isInteger(lu) || lu < 0) return base.prixCentimes;
  return lu;
}

export function offre(id: OffreId): Offre {
  const trouvee = CATALOGUE.find((o) => o.id === id);
  // Un identifiant hors catalogue ne doit jamais ouvrir plus de droits que
  // le gratuit. Retomber sur Découverte est le repli sûr ; lever ici
  // priverait quelqu'un de son produit à cause d'une ligne de base abîmée.
  const base = trouvee ?? (CATALOGUE.find((o) => o.id === OFFRE_PAR_DEFAUT) as Offre);
  return { ...base, prixCentimes: prixCentimes(base.id) };
}

/** L'offre au-dessus, ou `null` si c'est déjà la dernière. */
export function offreSuivante(id: OffreId): Offre | null {
  const index = CATALOGUE.findIndex((o) => o.id === id);
  if (index === -1) return CATALOGUE[1] ?? null;
  return CATALOGUE[index + 1] ?? null;
}

/**
 * LE FINANCEMENT IGNITUX N'EST PAS UN ABONNEMENT.
 *
 * C'est le prix d'une évaluation, payé une fois. Il ne l'est pas par
 * commodité comptable : le confondre avec un abonnement laisserait croire
 * qu'on achète un financement. On achète un examen — audit, faisabilité,
 * préparation du dossier, évaluation du risque — et la décision reste
 * indépendante de celui qui l'a payé.
 *
 * Cette phrase doit rester lisible partout où le montant s'affiche. Un test
 * la vérifie, parce que c'est la seule chose qui distingue une évaluation
 * payante d'une promesse vendue.
 */
export const EVALUATION_FINANCEMENT = {
  prixCentimes: 9900,
  label: 'Évaluation de financement',
  resume:
    'Un audit complet, une étude de faisabilité, la préparation du dossier et une ' +
    'évaluation du risque.',
  avertissement:
    "Ce montant paie l'évaluation, pas un financement. Elle peut conclure que le projet " +
    "n'est pas finançable en l'état, et c'est un résultat, pas un échec du service.",
} as const;

/**
 * Le numéro d'article de la constitution qui justifie la ligne de partage.
 *
 * Laissé en commentaire plutôt qu'en dépendance : ce module reste pur, et
 * une constitution importée ici le rendrait dépendant d'un service Nest.
 *
 * Article 3 (Protection de l'Étincelle) : personne ne doit perdre son idée
 * faute de moyens. C'est pourquoi tout ce qui n'a pas de coût marginal
 * reste gratuit, et pourquoi Découverte garde un projet complet plutôt
 * qu'une démonstration mutilée.
 */
